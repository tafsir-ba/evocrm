import "server-only";

import {
  ConversionEventModel,
  type ConversionEventDocument,
} from "@/models/conversion-event";
import { connectDb } from "@/server/db/mongoose";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import type { ConsentState } from "@/server/advertising/attribution/consent";
import {
  canExportConversion,
  emptyConsentState,
} from "@/server/advertising/attribution/consent";
import {
  CONVERSION_MILESTONES,
  ATTRIBUTION_MODELS,
} from "@/lib/advertising-constants";

export type ConversionMilestone = (typeof CONVERSION_MILESTONES)[number];
export type AttributionModel = (typeof ATTRIBUTION_MODELS)[number];

export type ConversionEventRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  growthCampaignId: string | null;
  leadId: string | null;
  opportunityId: string | null;
  touchpointId: string | null;
  milestone: string;
  value: number | null;
  currency: string | null;
  occurredAt: Date;
  consentSnapshot: ConsentState;
  exportStatus: string;
  attributionModel: string;
  createdAt: Date;
  updatedAt: Date;
};

function toConsent(raw: ConversionEventDocument["consentSnapshot"]): ConsentState {
  if (!raw) {
    return emptyConsentState();
  }
  return {
    granted: Boolean(raw.granted),
    channel: (raw.channel as ConsentState["channel"]) ?? null,
    purposes: [...(raw.purposes ?? [])] as ConsentState["purposes"],
    policyVersion: raw.policyVersion ?? null,
    capturedAt: raw.capturedAt ?? null,
    market: raw.market ?? null,
  };
}

function toRecord(document: ConversionEventDocument): ConversionEventRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    projectId: document.projectId.toString(),
    growthCampaignId: document.growthCampaignId?.toString() ?? null,
    leadId: document.leadId?.toString() ?? null,
    opportunityId: document.opportunityId?.toString() ?? null,
    touchpointId: document.touchpointId?.toString() ?? null,
    milestone: document.milestone,
    value: document.value ?? null,
    currency: document.currency ?? null,
    occurredAt: document.occurredAt,
    consentSnapshot: toConsent(document.consentSnapshot),
    exportStatus: document.exportStatus,
    attributionModel: document.attributionModel,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findConversionEvents(
  workspaceId: string,
  filter: { projectId?: string; leadId?: string; milestone?: string } = {},
): Promise<ConversionEventRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = {};
  if (filter.projectId) {
    query.projectId = filter.projectId;
  }
  if (filter.leadId) {
    query.leadId = filter.leadId;
  }
  if (filter.milestone) {
    query.milestone = filter.milestone;
  }

  const documents = await ConversionEventModel.find(
    withWorkspaceScope(workspaceId, query),
  )
    .sort({ occurredAt: -1 })
    .lean<ConversionEventDocument[]>();

  return documents.map(toRecord);
}

/** Phase 0/2 — export blocked without consent. Phase 2 never sends to Meta. */
export function evaluateConversionExportEligibility(
  consent: ConsentState,
): "pending" | "blocked_missing_consent" {
  return canExportConversion(consent) ? "pending" : "blocked_missing_consent";
}

export async function createConversionEvent(input: {
  workspaceId: string;
  projectId: string;
  growthCampaignId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  touchpointId?: string | null;
  milestone: ConversionMilestone;
  value?: number | null;
  currency?: string | null;
  occurredAt?: Date;
  consentSnapshot?: ConsentState;
  attributionModel?: AttributionModel;
}): Promise<ConversionEventRecord> {
  await connectDb();
  const consent = input.consentSnapshot ?? emptyConsentState();
  const exportStatus = canExportConversion(consent)
    ? "pending"
    : consent.granted === false
      ? "blocked_missing_consent"
      : "not_eligible";

  const document = await ConversionEventModel.create({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    growthCampaignId: input.growthCampaignId ?? null,
    leadId: input.leadId ?? null,
    opportunityId: input.opportunityId ?? null,
    touchpointId: input.touchpointId ?? null,
    milestone: input.milestone,
    value: input.value ?? null,
    currency: input.currency ?? null,
    occurredAt: input.occurredAt ?? new Date(),
    consentSnapshot: consent,
    exportStatus,
    attributionModel: input.attributionModel ?? "last_touch",
  });

  return toRecord(document.toObject());
}
