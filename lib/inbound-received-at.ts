import { isHubSpotOrLegacyMigratedLead } from "@/lib/campaign-enrollment-guard";
import { isLegacyImportLead } from "@/lib/inbound-acquisition";
import { readLeadIntegrationAttributes } from "@/lib/lead-integration-attributes";
import type { LeadIntelligenceProvenance } from "@/lib/lead-intelligence";
import { daysSince, formatRelativeAge, parseListDate } from "@/lib/list-view";

export const INBOUND_DEMAND_DAYS = 30;

export type InboundReceivedBasis = "received_at" | "source_created" | "capture_created";

export type ResolvedInboundReceivedAt = {
  at: Date;
  basis: InboundReceivedBasis;
};

export type ProjectDemandStatus = {
  label: "Archived" | "Active" | "Stale" | "Unknown";
  tone: "muted" | "success" | "warn" | "info";
};

export type LeadInboundSnapshot = {
  projectId?: string | null;
  createdAt?: string | Date | null;
  attributes?: Record<string, unknown> | null;
  intelligenceProvenance?: LeadIntelligenceProvenance | null;
};

const BASIS_LABEL: Record<InboundReceivedBasis, string> = {
  received_at: "received",
  source_created: "source date",
  capture_created: "capture",
};

function readIntegrationRecord(
  attributes: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!attributes || typeof attributes !== "object") {
    return null;
  }
  const raw = attributes.integration;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  return raw as Record<string, unknown>;
}

function firstExplicitInboundDate(
  integration: Record<string, unknown>,
): ResolvedInboundReceivedAt | null {
  const receivedAt = parseListDate(integration.receivedAt as string | Date | null | undefined);
  if (receivedAt) {
    return { at: receivedAt, basis: "received_at" };
  }

  const sourceCreatedAt = parseListDate(
    (integration.sourceCreatedAt as string | Date | null | undefined) ??
      (integration.createdate as string | Date | null | undefined) ??
      (integration.sourceCreatedDate as string | Date | null | undefined),
  );
  if (sourceCreatedAt) {
    return { at: sourceCreatedAt, basis: "source_created" };
  }

  return null;
}

export function resolveLeadInboundReceivedAt(
  lead: LeadInboundSnapshot,
): ResolvedInboundReceivedAt | null {
  const integration = readIntegrationRecord(lead.attributes);
  if (integration) {
    const explicit = firstExplicitInboundDate(integration);
    if (explicit) {
      return explicit;
    }
  }

  if (
    isHubSpotOrLegacyMigratedLead(lead.attributes) ||
    isLegacyImportLead({
      attributes: lead.attributes,
      intelligenceProvenance: lead.intelligenceProvenance,
    })
  ) {
    return null;
  }

  const attribution = readLeadIntegrationAttributes(lead.attributes);
  const isLiveCapture = Boolean(attribution?.integrationId || attribution?.inboundSource);
  if (!isLiveCapture) {
    return null;
  }

  const capturedAt = parseListDate(lead.createdAt);
  if (!capturedAt) {
    return null;
  }

  return { at: capturedAt, basis: "capture_created" };
}

export function projectDemandStatus(input: {
  archivedAt?: string | Date | null;
  lastGenuineInboundAt?: string | Date | null;
  now?: Date;
}): ProjectDemandStatus {
  if (input.archivedAt) {
    return { label: "Archived", tone: "muted" };
  }

  const now = input.now ?? new Date();
  const lastInbound = parseListDate(input.lastGenuineInboundAt);
  if (!lastInbound) {
    return { label: "Unknown", tone: "info" };
  }

  const ageDays = daysSince(lastInbound, now);
  if (ageDays !== null && ageDays > INBOUND_DEMAND_DAYS) {
    return { label: "Stale", tone: "warn" };
  }

  return { label: "Active", tone: "success" };
}

export function summarizeProjectInboundDemand(
  leads: LeadInboundSnapshot[],
): Map<string, ResolvedInboundReceivedAt> {
  const latest = new Map<string, ResolvedInboundReceivedAt>();

  for (const lead of leads) {
    const projectId = lead.projectId?.toString();
    if (!projectId) {
      continue;
    }

    const resolved = resolveLeadInboundReceivedAt(lead);
    if (!resolved) {
      continue;
    }

    const current = latest.get(projectId);
    if (!current || resolved.at.getTime() > current.at.getTime()) {
      latest.set(projectId, resolved);
    }
  }

  return latest;
}

export function inboundBasisLabel(basis: InboundReceivedBasis | null | undefined): string {
  return basis ? BASIS_LABEL[basis] : "needs data";
}

export function formatInboundDemandLine(
  lastGenuineInboundAt: string | Date | null | undefined,
  basis: InboundReceivedBasis | null | undefined,
  now?: Date,
): string {
  if (!lastGenuineInboundAt) {
    return "Needs inbound date";
  }

  return `${formatRelativeAge(lastGenuineInboundAt, now)} · ${inboundBasisLabel(basis)}`;
}

export function formatInboundDemandAudit(
  lastGenuineInboundAt: string | Date | null | undefined,
  basis: InboundReceivedBasis | null | undefined,
): string {
  const date = parseListDate(lastGenuineInboundAt);
  if (!date) {
    return "No trustworthy inbound-received date";
  }

  return `${date.toISOString()} · ${inboundBasisLabel(basis)}`;
}
