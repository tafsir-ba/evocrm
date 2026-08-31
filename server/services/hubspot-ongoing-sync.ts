import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { LIVE_HUBSPOT_INBOUND_SOURCE } from "@/lib/inbound-acquisition";
import { planHubSpotCmpLeadIntelligence } from "@/lib/hubspot-cmp-lead-intelligence";
import {
  assertOngoingSyncSideEffectGuard,
  campaignAttributesForHubSpotSync,
  classifyHubSpotLeadSource,
  evaluateHubSpotCutoverWatermark,
  evaluateHubSpotSyncMutationGate,
  evaluateHubSpotCutoverDryRun,
  hashNormalizedEmailForKey,
  hubspotOngoingContactIdempotencyKey,
  hubspotSyncEventKey,
  isStaleHubSpotEvent,
  mergeLeadAttributesForHubSpotSync,
  nextHubSpotSyncEventStatus,
  planHubSpotIdentityWrites,
  planHubSpotReconcileCursorAdvance,
  resolveHubSpotEmailMatch,
  resolveHubSpotInboundDates,
  resolveHubSpotReconcileSearchWindow,
  shouldSkipHubSpotReconcileContact,
  HUBSPOT_ONGOING_SYNC_INTELLIGENCE_SOURCE,
  HUBSPOT_ONGOING_SYNC_SIDE_EFFECT_GUARD,
  type HubSpotOwnedFields,
  type HubSpotSyncOutcome,
} from "@/lib/hubspot-ongoing-sync";
import {
  planHubSpotOngoingAttribution,
  shouldPreserveManualMemberships,
  type HubSpotOngoingMapping,
} from "@/lib/hubspot-ongoing-attribution";
import { normalizePilotNamePart } from "@/lib/hubspot-gv-pilot";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import {
  findLeadByHubSpotContactId,
  listActiveLeadsByNormalizedEmail,
  type LeadRecord,
} from "@/server/repositories/leads";
import { findMembershipsForLead } from "@/server/repositories/lead-project-memberships";
import { listHubSpotProjectMappings } from "@/server/repositories/hubspot-project-mappings";
import {
  claimHubSpotSyncEvent,
  countHubSpotSyncEvents,
  findLatestHubSpotSyncEventForContact,
  listRetryableHubSpotSyncEvents,
  updateHubSpotSyncEvent,
} from "@/server/repositories/hubspot-sync-events";
import {
  ensureHubSpotSyncCursor,
  findHubSpotSyncCursor,
  updateHubSpotSyncCursor,
  type HubSpotSyncCursorRecord,
} from "@/server/repositories/hubspot-sync-cursors";
import { findProjectById, findProjects } from "@/server/repositories/projects";
import { findIntegrations, type IntegrationRecord } from "@/server/repositories/integrations";
import { ensureDefaultDictionaries } from "@/server/services/default-dictionaries";
import {
  assertHubSpotAccessToken,
  fetchHubSpotContact,
  fetchHubSpotContactProjectAssociationIds,
  searchHubSpotContactsCreatedOrModifiedSince,
  searchHubSpotContactsModifiedSince,
  type HubSpotContact,
} from "@/server/services/hubspot-client";
import { resolveOrCreateCompanyByName } from "@/server/services/companies";
import {
  createLeadForWorkspace,
  normalizeLeadEmail,
  updateLeadForWorkspace,
} from "@/server/services/leads";
import { applyPlannedMembershipsToLead } from "@/server/services/lead-project-memberships";
import {
  writeIntegrationLog,
} from "@/server/services/integration-logs";
import { decodeHubSpotCredentials } from "@/server/security/integration-credentials";
import type { HubSpotWebhookEvent } from "@/server/utils/hubspot-webhook";

assertOngoingSyncSideEffectGuard();

export type HubSpotOngoingSyncSummary = {
  received: number;
  created: number;
  updated: number;
  duplicates: number;
  skipped: number;
  parked: number;
  failed: number;
  wouldCreate: number;
  wouldUpdate: number;
};

function emptySummary(): HubSpotOngoingSyncSummary {
  return {
    received: 0,
    created: 0,
    updated: 0,
    duplicates: 0,
    skipped: 0,
    parked: 0,
    failed: 0,
    wouldCreate: 0,
    wouldUpdate: 0,
  };
}

function mutationGateForPath(path: "webhook" | "reconcile" | "cutover", cursor: HubSpotSyncCursorRecord | null) {
  return evaluateHubSpotSyncMutationGate({
    releaseGate: process.env.HUBSPOT_ONGOING_SYNC_RELEASE_GATE,
    webhookMutate: process.env.HUBSPOT_ONGOING_SYNC_WEBHOOK_MUTATE,
    reconcileEnabled: process.env.HUBSPOT_ONGOING_SYNC_RECONCILE,
    path,
    cursorStatus: cursor?.status,
    dryRunVerifiedAt: cursor?.dryRunVerifiedAt,
  });
}

function tally(summary: HubSpotOngoingSyncSummary, outcome: HubSpotSyncOutcome, mutate: boolean): void {
  switch (outcome) {
    case "created":
      summary.created += 1;
      break;
    case "updated":
      summary.updated += 1;
      break;
    case "would_create":
      if (mutate) {
        summary.created += 1;
      } else {
        summary.wouldCreate += 1;
      }
      break;
    case "would_update":
      if (mutate) {
        summary.updated += 1;
      } else {
        summary.wouldUpdate += 1;
      }
      break;
    case "duplicate":
      summary.duplicates += 1;
      break;
    case "parked":
      summary.parked += 1;
      break;
    case "failed":
      summary.failed += 1;
      break;
    default:
      summary.skipped += 1;
  }
}

async function resolveLeadSourceId(
  workspaceId: string,
  key: "website" | "hubspot" | "google_ads" | "meta_ads" | "referral",
): Promise<string | null> {
  const preferred = await findDictionaryItemByTypeAndKey(workspaceId, "lead_source", key);
  if (preferred?.isActive) {
    return preferred.id;
  }
  const hubspot = await findDictionaryItemByTypeAndKey(workspaceId, "lead_source", "hubspot");
  return hubspot?.isActive ? hubspot.id : null;
}

async function resolveDefaultLeadStatusId(workspaceId: string): Promise<string> {
  const status = await findDictionaryItemByTypeAndKey(workspaceId, "lead_status", "new");
  if (!status || !status.isActive) {
    throw new AppError("INTERNAL_ERROR", "Default lead status is not configured for this workspace.", {
      expose: false,
    });
  }
  return status.id;
}

async function loadAttributionMappings(
  workspaceId: string,
  integrationId: string,
): Promise<HubSpotOngoingMapping[]> {
  const mappings = await listHubSpotProjectMappings(workspaceId, integrationId);
  const projects = await findProjects(workspaceId, { includeArchived: true });
  const byId = new Map(projects.map((project) => [project.id, project]));
  return mappings.map((mapping) => {
    const project = mapping.evoProjectId ? byId.get(mapping.evoProjectId) : null;
    return {
      hubspotProjectId: mapping.hubspotProjectId,
      status: mapping.status,
      evoProjectId: mapping.evoProjectId,
      evoProjectName: project?.name ?? mapping.hubspotProjectName,
      evoProjectReference: project?.reference ?? null,
    };
  });
}

function readOwnedFields(lead: LeadRecord | null): HubSpotOwnedFields {
  const integration = lead?.attributes?.integration;
  if (!integration || typeof integration !== "object" || Array.isArray(integration)) {
    return {};
  }
  const raw = (integration as Record<string, unknown>).ownedFields;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as HubSpotOwnedFields;
}

function inboundSourceOf(lead: LeadRecord | null): string | null {
  const integration = lead?.attributes?.integration;
  if (!integration || typeof integration !== "object" || Array.isArray(integration)) {
    return null;
  }
  const source = (integration as Record<string, unknown>).inboundSource;
  return typeof source === "string" ? source : null;
}

function namesMatch(
  left: { firstName: string; lastName: string },
  right: { firstName: string; lastName: string },
): boolean {
  return (
    normalizePilotNamePart(left.firstName) === normalizePilotNamePart(right.firstName) &&
    normalizePilotNamePart(left.lastName) === normalizePilotNamePart(right.lastName)
  );
}

async function logSync(input: {
  integration: IntegrationRecord;
  eventType: string;
  status: "success" | "failed";
  summary: Record<string, unknown>;
  error?: unknown;
}): Promise<void> {
  await Promise.resolve(
    writeIntegrationLog({
      workspaceId: input.integration.workspaceId,
      integrationId: input.integration.id,
      direction: "inbound",
      status: input.status,
      eventType: input.eventType,
      payloadSummary: input.summary,
      error: input.error,
    }),
  ).catch(() => undefined);
}

export async function processOngoingHubSpotContact(input: {
  integration: IntegrationRecord;
  contactId: string;
  event?: HubSpotWebhookEvent;
  path: "webhook" | "reconcile" | "cutover";
  cursor: HubSpotSyncCursorRecord;
  mutate: boolean;
  planOnly: boolean;
  contactOverride?: HubSpotContact;
}): Promise<{ outcome: HubSpotSyncOutcome; leadId: string | null; parkReason?: string }> {
  const credentials = decodeHubSpotCredentials(input.integration.credentialsEncrypted);
  const workspaceId = input.integration.workspaceId;
  const contactId = String(input.contactId);
  const occurredAtMs = input.event?.occurredAt ?? null;
  const occurredAtDate =
    typeof occurredAtMs === "number" ? new Date(occurredAtMs) : occurredAtMs ? new Date(occurredAtMs) : null;

  const existingByContact = await findLeadByHubSpotContactId(workspaceId, contactId);
  const latestEvent = await findLatestHubSpotSyncEventForContact(
    workspaceId,
    input.integration.id,
    contactId,
  );
  if (
    isStaleHubSpotEvent({
      incomingOccurredAt: occurredAtMs ?? input.contactOverride?.lastModifiedAt,
      lastProcessedOccurredAt: latestEvent?.occurredAt ?? null,
    })
  ) {
    return { outcome: "skipped", leadId: existingByContact?.id ?? null };
  }

  const contact =
    input.contactOverride ??
    (await fetchHubSpotContact({
      accessToken: credentials.accessToken,
      contactId,
    }));

  if (!contact.email && !contact.phone) {
    await logSync({
      integration: input.integration,
      eventType: "hubspot.sync.skipped",
      status: "failed",
      summary: { contactId, reason: "missing_email_and_phone" },
    });
    return { outcome: "skipped", leadId: null, parkReason: "missing_email_and_phone" };
  }

  const emailFields = contact.email ? normalizeLeadEmail(contact.email) : null;
  const eventKey = hubspotSyncEventKey({
    contactId,
    occurredAt: occurredAtMs,
    lastModifiedAt: contact.lastModifiedAt,
    subscriptionType: input.event?.subscriptionType ?? input.path,
    eventId: input.event?.eventId,
    emailNormalized: emailFields?.emailNormalized,
  });

  const claimed = await claimHubSpotSyncEvent({
    workspaceId,
    integrationId: input.integration.id,
    eventKey,
    contactId,
    subscriptionType: input.event?.subscriptionType ?? input.path,
    hubspotEventId: input.event?.eventId != null ? String(input.event.eventId) : null,
    occurredAt: occurredAtDate && !Number.isNaN(occurredAtDate.getTime()) ? occurredAtDate : null,
    lastModifiedAt: contact.lastModifiedAt,
    emailHash: hashNormalizedEmailForKey(emailFields?.emailNormalized),
    payloadSummary: {
      contactId,
      subscriptionType: input.event?.subscriptionType ?? input.path,
      path: input.path,
    },
  });

  if (!claimed.created && claimed.record.status === "processed") {
    return { outcome: "duplicate", leadId: claimed.record.leadId };
  }
  if (!claimed.created && claimed.record.status === "dead_letter") {
    return { outcome: "skipped", leadId: claimed.record.leadId, parkReason: "dead_letter" };
  }

  const attempts = claimed.record.attemptCount + 1;
  await updateHubSpotSyncEvent(workspaceId, claimed.record.id, { attemptCount: attempts });

  try {
    await ensureDefaultDictionaries(workspaceId);

    const mappings = await loadAttributionMappings(workspaceId, input.integration.id);
    let associationIds: string[] = [];
    if (!contact.properties.wd_project) {
      associationIds = await fetchHubSpotContactProjectAssociationIds({
        accessToken: credentials.accessToken,
        contactId,
      }).catch(() => []);
    }
    const attribution = planHubSpotOngoingAttribution({
      wdProjectValue: contact.properties.wd_project,
      productInterestedIn: contact.properties.product_intersted_in,
      associationProjectIds: associationIds,
      mappings,
      hubspotContactId: contactId,
    });

    if (!attribution.ok || !attribution.primaryProjectId) {
      await updateHubSpotSyncEvent(workspaceId, claimed.record.id, {
        status: "processed",
        outcome: "parked",
        parkReason: attribution.reason,
      });
      await logSync({
        integration: input.integration,
        eventType: "hubspot.sync.parked",
        status: "success",
        summary: {
          contactId,
          reason: attribution.reason,
          conflicts: attribution.conflicts.join(","),
        },
      });
      return { outcome: "parked", leadId: existingByContact?.id ?? null, parkReason: attribution.reason };
    }

    let existing = existingByContact;
    if (!existing && emailFields?.emailNormalized) {
      const candidates = await listActiveLeadsByNormalizedEmail(
        workspaceId,
        emailFields.emailNormalized,
      );
      const emailMatch = resolveHubSpotEmailMatch({
        destinationProjectId: attribution.primaryProjectId,
        candidates: candidates.map((lead) => ({
          id: lead.id,
          projectId: lead.projectId,
          namesMatch: namesMatch(lead, contact),
        })),
      });
      if (emailMatch.kind === "park") {
        await updateHubSpotSyncEvent(workspaceId, claimed.record.id, {
          status: "processed",
          outcome: "parked",
          parkReason: emailMatch.reason,
        });
        await logSync({
          integration: input.integration,
          eventType: "hubspot.sync.parked",
          status: "success",
          summary: { contactId, reason: emailMatch.reason },
        });
        return { outcome: "parked", leadId: null, parkReason: emailMatch.reason };
      }
      if (emailMatch.kind === "match") {
        existing = candidates.find((lead) => lead.id === emailMatch.leadId) ?? null;
      }
    }

    const watermark = evaluateHubSpotCutoverWatermark({
      sourceCreatedAt: contact.createdAt,
      cutoverAt: input.cursor.cutoverAt,
      existingLead: Boolean(existing),
    });
    if (watermark.kind === "park") {
      await updateHubSpotSyncEvent(workspaceId, claimed.record.id, {
        status: "processed",
        outcome: "parked",
        parkReason: watermark.reason,
        leadId: existing?.id ?? null,
      });
      await logSync({
        integration: input.integration,
        eventType: "hubspot.sync.parked",
        status: "success",
        summary: { contactId, reason: watermark.reason },
      });
      return { outcome: "parked", leadId: existing?.id ?? null, parkReason: watermark.reason };
    }

    const classification = classifyHubSpotLeadSource({
      analyticsSource: contact.properties.hs_analytics_source,
      latestSource: contact.properties.hs_latest_source,
      objectSource: contact.properties.hs_object_source,
    });
    const newAcquisition = watermark.kind === "new_acquisition" && !existing;
    const organic = newAcquisition && classification.organic;

    const primaryProject = await findProjectById(workspaceId, attribution.primaryProjectId);
    if (!primaryProject || primaryProject.archivedAt) {
      await updateHubSpotSyncEvent(workspaceId, claimed.record.id, {
        status: "processed",
        outcome: "parked",
        parkReason: "destination_archived",
      });
      return { outcome: "parked", leadId: existing?.id ?? null, parkReason: "destination_archived" };
    }

    const now = new Date();
    const dates = resolveHubSpotInboundDates({
      sourceCreatedAt: contact.createdAt,
      analyticsFirstTimestamp: contact.properties.hs_analytics_first_timestamp,
      syncNow: now,
      organic,
      newAcquisition,
    });

    const resolvedCompany = await resolveOrCreateCompanyByName(
      workspaceId,
      input.integration.createdBy,
      contact.properties.company,
    );
    const intelligence = planHubSpotCmpLeadIntelligence({
      snapshot: {
        contactId: contact.id,
        properties: contact.properties,
      },
      existing: {
        industry: existing?.industry ?? null,
        jobTitle: existing?.jobTitle ?? null,
        stateRegion: existing?.stateRegion ?? null,
        companyId: existing?.companyId ?? null,
      },
      existingProvenance: existing?.intelligenceProvenance,
      resolvedCompanyId: resolvedCompany?.company.id ?? null,
      requireCmpProduct: false,
      appliedAt: now.toISOString(),
    });

    const identity = planHubSpotIdentityWrites({
      existing: {
        firstName: existing?.firstName,
        lastName: existing?.lastName,
        email: existing?.email,
        phone: existing?.phone,
      },
      incoming: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
      },
      ownedFields: existing ? readOwnedFields(existing) : undefined,
      appliedAt: now,
    });

    const keepLegacySource = Boolean(existing) && inboundSourceOf(existing) !== LIVE_HUBSPOT_INBOUND_SOURCE;
    const inboundSource = keepLegacySource
      ? inboundSourceOf(existing)
      : LIVE_HUBSPOT_INBOUND_SOURCE;

    const integrationPatch: Record<string, unknown> = {
      integrationId: input.integration.id,
      externalId: contact.id,
      idempotencyKey: hubspotOngoingContactIdempotencyKey(contact.id),
      inboundSource,
      lastSyncedAt: dates.lastSyncedAt,
      lastOccurredAt: occurredAtDate?.toISOString() ?? contact.lastModifiedAt,
      lastModifiedAt: contact.lastModifiedAt,
      analyticsSource: classification.analyticsSource,
      objectSource: classification.objectSource,
      acquisitionChannel: keepLegacySource
        ? undefined
        : classification.acquisitionChannel,
      syncPath: input.path,
      ...(dates.sourceCreatedAt && !keepLegacySource ? { sourceCreatedAt: dates.sourceCreatedAt } : {}),
      ...(dates.receivedAt && !keepLegacySource ? { receivedAt: dates.receivedAt } : {}),
      ...(contact.properties.product_intersted_in
        ? { productInterestedIn: contact.properties.product_intersted_in }
        : {}),
      ...(contact.properties.wd_project ? { wdProject: contact.properties.wd_project } : {}),
      ...(buildUtm(contact.properties) ?? {}),
      ...(input.event?.eventId != null ? { hubspotEventId: String(input.event.eventId) } : {}),
    };

    if (keepLegacySource) {
      delete integrationPatch.acquisitionChannel;
      delete integrationPatch.sourceCreatedAt;
      delete integrationPatch.receivedAt;
    }

    const campaignPolicy = keepLegacySource
      ? undefined
      : campaignAttributesForHubSpotSync({ organic, newAcquisition });

    const attributes = mergeLeadAttributesForHubSpotSync({
      existing: existing?.attributes,
      integrationPatch,
      campaignPolicy,
      ownedFields: existing
        ? identity.ownedFields
        : {
            firstName: { method: "hubspot", source: HUBSPOT_ONGOING_SYNC_INTELLIGENCE_SOURCE, appliedAt: now.toISOString() },
            lastName: { method: "hubspot", source: HUBSPOT_ONGOING_SYNC_INTELLIGENCE_SOURCE, appliedAt: now.toISOString() },
            ...(contact.email
              ? {
                  email: {
                    method: "hubspot" as const,
                    source: HUBSPOT_ONGOING_SYNC_INTELLIGENCE_SOURCE,
                    appliedAt: now.toISOString(),
                  },
                }
              : {}),
            ...(contact.phone
              ? {
                  phone: {
                    method: "hubspot" as const,
                    source: HUBSPOT_ONGOING_SYNC_INTELLIGENCE_SOURCE,
                    appliedAt: now.toISOString(),
                  },
                }
              : {}),
          },
    });

    const plannedOutcome: HubSpotSyncOutcome = existing
      ? input.mutate
        ? "updated"
        : "would_update"
      : input.mutate
        ? "created"
        : "would_create";

    if (!input.mutate || input.planOnly) {
      await updateHubSpotSyncEvent(workspaceId, claimed.record.id, {
        status: "processed",
        outcome: plannedOutcome,
        leadId: existing?.id ?? null,
        payloadSummary: { contactId, outcome: plannedOutcome, mutate: false },
      });
      return { outcome: plannedOutcome, leadId: existing?.id ?? null };
    }

    let leadId: string;

    if (existing) {
      const updatePayload: Parameters<typeof updateLeadForWorkspace>[3] = {
        attributes,
        industry: intelligence.values.industry,
        jobTitle: intelligence.values.jobTitle,
        stateRegion: intelligence.values.stateRegion,
        companyId: intelligence.values.companyId,
      };
      if (identity.values.firstName) {
        updatePayload.firstName = identity.values.firstName;
      }
      if (identity.values.lastName) {
        updatePayload.lastName = identity.values.lastName;
      }
      if (identity.values.email) {
        updatePayload.email = identity.values.email;
      }
      if (identity.values.phone) {
        updatePayload.phone = identity.values.phone;
      }

      const updated = await updateLeadForWorkspace(
        workspaceId,
        existing.id,
        input.integration.createdBy,
        updatePayload,
        {
          triggerAutomation: false,
          intelligenceMethod: "hubspot",
          intelligenceSource: HUBSPOT_ONGOING_SYNC_INTELLIGENCE_SOURCE,
        },
      );
      leadId = updated.lead.id;
    } else {
      const statusId = await resolveDefaultLeadStatusId(workspaceId);
      const sourceId = await resolveLeadSourceId(workspaceId, classification.leadSourceKey);
      const noteParts = [
        contact.properties.city || contact.properties.country
          ? `Location: ${[contact.properties.city, contact.properties.country].filter(Boolean).join(", ")}`
          : null,
        contact.properties.message ? contact.properties.message : null,
      ].filter(Boolean);

      const created = await createLeadForWorkspace(
        workspaceId,
        input.integration.createdBy,
        {
          projectId: attribution.primaryProjectId,
          statusId,
          sourceId: sourceId ?? undefined,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email ?? undefined,
          phone: contact.phone ?? undefined,
          notes: noteParts.length > 0 ? noteParts.join("\n") : undefined,
          industry: intelligence.values.industry,
          jobTitle: intelligence.values.jobTitle,
          stateRegion: intelligence.values.stateRegion,
          companyId: intelligence.values.companyId ?? undefined,
          emailConsentStatus: "unknown",
          attributes,
        },
        {
          triggerAutomation: false,
          intelligenceMethod: "hubspot",
          intelligenceSource: HUBSPOT_ONGOING_SYNC_INTELLIGENCE_SOURCE,
        },
      );
      leadId = created.lead.id;
    }

    const memberships = await findMembershipsForLead(workspaceId, leadId);
    if (!shouldPreserveManualMemberships(memberships.map((item) => item.source))) {
      if (attribution.memberships.length > 0) {
        await applyPlannedMembershipsToLead({
          workspaceId,
          leadId,
          actorId: input.integration.createdBy,
          plans: attribution.memberships,
        });
      }
    }

    await updateHubSpotSyncEvent(workspaceId, claimed.record.id, {
      status: "processed",
      outcome: existing ? "updated" : "created",
      leadId,
    });

    await logSync({
      integration: input.integration,
      eventType: existing ? "hubspot.sync.updated" : "hubspot.sync.created",
      status: "success",
      summary: {
        contactId,
        leadId,
        organic,
        newAcquisition,
        projectCount: attribution.projectIds.length,
      },
    });

    await createAuditLog({
      workspaceId,
      actorId: input.integration.createdBy,
      action: existing ? "integration.hubspot_sync_updated" : "integration.hubspot_sync_created",
      entityType: "lead",
      entityId: leadId,
      after: {
        integrationId: input.integration.id,
        hubspotContactId: contactId,
        triggerAutomation: false,
      },
    });

    return { outcome: existing ? "updated" : "created", leadId };
  } catch (error) {
    const status = nextHubSpotSyncEventStatus({ attempts, failed: true });
    await Promise.resolve(
      updateHubSpotSyncEvent(workspaceId, claimed.record.id, {
        status,
        outcome: "failed",
        errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR",
      }),
    ).catch(() => undefined);
    await logSync({
      integration: input.integration,
      eventType: "hubspot.sync.failed",
      status: "failed",
      summary: { contactId, reason: "sync_failed" },
      error,
    });
    throw error;
  }
}

function buildUtm(properties: Record<string, string | null>): { utm?: Record<string, string> } {
  const utm: Record<string, string> = {};
  const source = properties.utm_source || properties.hs_analytics_source;
  const campaign = properties.utm_campaign || properties.hs_analytics_source_data_1;
  const content = properties.utm_content || properties.hs_analytics_source_data_2;
  if (source) utm.source = source;
  if (properties.utm_medium) utm.medium = properties.utm_medium;
  if (campaign) utm.campaign = campaign;
  if (properties.utm_term) utm.term = properties.utm_term;
  if (content) utm.content = content;
  return Object.keys(utm).length > 0 ? { utm } : {};
}

export async function processOngoingHubSpotEvents(input: {
  integration: IntegrationRecord;
  events: Array<{ contactId: string; event?: HubSpotWebhookEvent; contact?: HubSpotContact }>;
  path: "webhook" | "reconcile" | "cutover";
}): Promise<HubSpotOngoingSyncSummary> {
  const cursor = await ensureHubSpotSyncCursor({
    workspaceId: input.integration.workspaceId,
    integrationId: input.integration.id,
    portalId: input.integration.externalAccountId ?? "",
  });
  const gate = mutationGateForPath(input.path, cursor);
  const summary = emptySummary();
  summary.received = input.events.length;

  if (!gate.plan && !gate.mutate) {
    summary.skipped = input.events.length;
    await logSync({
      integration: input.integration,
      eventType: "hubspot.sync.gated",
      status: "success",
      summary: { reason: gate.reason, received: input.events.length },
    });
    return summary;
  }

  for (const item of input.events) {
    try {
      const result = await processOngoingHubSpotContact({
        integration: input.integration,
        contactId: item.contactId,
        event: item.event,
        path: input.path,
        cursor,
        mutate: gate.mutate,
        planOnly: !gate.mutate,
        contactOverride: item.contact,
      });
      tally(summary, result.outcome, gate.mutate);
    } catch {
      summary.failed += 1;
    }
  }

  if (input.path === "webhook") {
    await Promise.resolve(
      updateHubSpotSyncCursor(input.integration.workspaceId, input.integration.id, {
        lastWebhookOccurredAt: new Date(),
      }),
    ).catch(() => undefined);
  }

  return summary;
}

function addSummaries(target: HubSpotOngoingSyncSummary, source: HubSpotOngoingSyncSummary): void {
  target.received += source.received;
  target.created += source.created;
  target.updated += source.updated;
  target.duplicates += source.duplicates;
  target.skipped += source.skipped;
  target.parked += source.parked;
  target.failed += source.failed;
  target.wouldCreate += source.wouldCreate;
  target.wouldUpdate += source.wouldUpdate;
}

export async function reconcileHubSpotOngoingSync(input?: {
  workspaceId?: string;
  limit?: number;
}): Promise<HubSpotOngoingSyncSummary & { integrations: number }> {
  const integrations = await collectActiveHubSpotIntegrations(input?.workspaceId);
  const totals = emptySummary();
  let integrationCount = 0;

  for (const integration of integrations) {
    const cursor = await findHubSpotSyncCursor(integration.workspaceId, integration.id);
    const gate = mutationGateForPath("reconcile", cursor);
    if (!gate.plan) {
      continue;
    }
    integrationCount += 1;
    const credentials = decodeHubSpotCredentials(integration.credentialsEncrypted);
    await assertHubSpotAccessToken(credentials.accessToken);

    const retryable = await listRetryableHubSpotSyncEvents(
      integration.workspaceId,
      integration.id,
      input?.limit ?? 50,
    );
    const retriedContactIds = new Set(retryable.map((event) => event.contactId));
    const retrySummary =
      retryable.length > 0
        ? await processOngoingHubSpotEvents({
            integration,
            events: retryable.map((event) => ({ contactId: event.contactId })),
            path: "reconcile",
          })
        : emptySummary();
    addSummaries(totals, retrySummary);

    const window = resolveHubSpotReconcileSearchWindow({
      lastReconciledModifiedAt: cursor?.lastReconciledModifiedAt,
      lastReconciledAfter: cursor?.lastReconciledAfter,
      lastReconciledContactId: cursor?.lastReconciledContactId,
      cutoverAt: cursor?.cutoverAt,
    });

    const page = await searchHubSpotContactsModifiedSince({
      accessToken: credentials.accessToken,
      modifiedAfterIso: window.modifiedAfterIso,
      after: window.after,
      limit: input?.limit ?? 50,
      operator: window.operator,
    });

    const pageContacts = page.contacts.filter((contact) => {
      if (!contact.id || retriedContactIds.has(contact.id)) {
        return false;
      }
      return !shouldSkipHubSpotReconcileContact({
        contactId: contact.id,
        lastModifiedAt: contact.lastModifiedAt,
        filterModifiedAtIso: window.modifiedAfterIso,
        skipContactIdAtWatermark: window.skipContactIdAtWatermark,
      });
    });

    const pageSummary = await processOngoingHubSpotEvents({
      integration,
      events: pageContacts.map((contact) => ({ contactId: contact.id, contact })),
      path: "reconcile",
    });
    addSummaries(totals, pageSummary);

    const advance = planHubSpotReconcileCursorAdvance({
      pageHadFailures: retrySummary.failed > 0 || pageSummary.failed > 0,
      nextAfter: page.nextAfter,
      contacts: page.contacts.map((contact) => ({
        id: contact.id,
        lastModifiedAt: contact.lastModifiedAt,
      })),
      filterModifiedAtIso: window.modifiedAfterIso,
      currentTieBreakContactId: cursor?.lastReconciledContactId,
    });

    if (advance.shouldWrite) {
      await Promise.resolve(
        updateHubSpotSyncCursor(integration.workspaceId, integration.id, {
          lastReconciledModifiedAt: advance.lastReconciledModifiedAt,
          lastReconciledAfter: advance.lastReconciledAfter,
          lastReconciledContactId: advance.lastReconciledContactId,
        }),
      ).catch(() => undefined);
    }
  }

  return { ...totals, integrations: integrationCount };
}

async function collectActiveHubSpotIntegrations(workspaceId?: string): Promise<IntegrationRecord[]> {
  if (workspaceId) {
    return findIntegrations(workspaceId, { type: "hubspot", status: "active" });
  }
  const { findAllWorkspaces } = await import("@/server/repositories/workspaces");
  const workspaces = await findAllWorkspaces();
  const all: IntegrationRecord[] = [];
  for (const workspace of workspaces) {
    all.push(...(await findIntegrations(workspace.id, { type: "hubspot", status: "active" })));
  }
  return all;
}

export async function getHubSpotOngoingSyncObservability(input: {
  workspaceId: string;
  integrationId: string;
}): Promise<{
  cursor: HubSpotSyncCursorRecord | null;
  events: Awaited<ReturnType<typeof countHubSpotSyncEvents>>;
  gate: ReturnType<typeof evaluateHubSpotSyncMutationGate>;
}> {
  const cursor = await findHubSpotSyncCursor(input.workspaceId, input.integrationId);
  return {
    cursor,
    events: await countHubSpotSyncEvents(input.workspaceId, input.integrationId),
    gate: mutationGateForPath("webhook", cursor),
  };
}

export async function prepareHubSpotOngoingCutover(input: {
  workspaceId: string;
  integrationId: string;
  portalId: string;
  cutoverAt?: Date;
  verifyDryRun?: boolean;
  activate?: boolean;
  dryRunSummary?: Record<string, unknown>;
}): Promise<HubSpotSyncCursorRecord> {
  const cursor = await ensureHubSpotSyncCursor({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    portalId: input.portalId,
  });
  const patch: Parameters<typeof updateHubSpotSyncCursor>[2] = {};
  if (input.cutoverAt) {
    patch.cutoverAt = input.cutoverAt;
  }
  if (input.dryRunSummary) {
    patch.dryRunSummary = input.dryRunSummary;
  }

  const summaryForVerify = input.dryRunSummary ?? cursor.dryRunSummary;
  if (input.verifyDryRun) {
    const verification = evaluateHubSpotCutoverDryRun({
      received: Number(summaryForVerify?.received ?? 0),
      searched: summaryForVerify?.searched === true,
    });
    if (!verification.ok) {
      throw new AppError(
        "VALIDATION_ERROR",
        verification.reason === "search_not_run"
          ? "Cutover dry-run must search HubSpot before verification."
          : "Cutover dry-run returned zero HubSpot contacts; verification is invalid.",
      );
    }
    patch.dryRunVerifiedAt = new Date();
    patch.status = "dry_run_verified";
  }
  if (input.activate) {
    const verified = input.verifyDryRun || cursor.dryRunVerifiedAt;
    if (!verified) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Dry-run must be verified before activating HubSpot ongoing sync.",
      );
    }
    patch.status = "active";
  }
  const updated = await updateHubSpotSyncCursor(input.workspaceId, input.integrationId, patch);
  return updated ?? cursor;
}

export async function runHubSpotOngoingCutoverDryRun(input: {
  integration: IntegrationRecord;
  cursor: HubSpotSyncCursorRecord;
  limit?: number;
  maxPages?: number;
}): Promise<HubSpotOngoingSyncSummary & { searched: true; pages: number }> {
  const sinceIso =
    input.cursor.cutoverAt?.toISOString() ?? new Date(0).toISOString();
  const credentials = decodeHubSpotCredentials(input.integration.credentialsEncrypted);
  await assertHubSpotAccessToken(credentials.accessToken);

  const totals = emptySummary();
  let after: string | null = null;
  let pages = 0;
  const maxPages = Math.min(Math.max(input.maxPages ?? 20, 1), 50);
  const pageLimit = input.limit ?? 50;

  do {
    const page = await searchHubSpotContactsCreatedOrModifiedSince({
      accessToken: credentials.accessToken,
      sinceIso,
      after,
      limit: pageLimit,
    });
    pages += 1;
    const pageSummary = await processOngoingHubSpotEvents({
      integration: input.integration,
      events: page.contacts
        .filter((contact) => contact.id)
        .map((contact) => ({ contactId: contact.id, contact })),
      path: "cutover",
    });
    addSummaries(totals, pageSummary);
    after = page.nextAfter;
  } while (after && pages < maxPages);

  const verification = evaluateHubSpotCutoverDryRun({
    received: totals.received,
    searched: true,
  });
  if (!verification.ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Cutover dry-run retrieved zero post-watermark HubSpot contacts. Set --cutover-at to include at least one fixture contact and re-run.",
    );
  }

  return { ...totals, searched: true, pages };
}

export { HUBSPOT_ONGOING_SYNC_SIDE_EFFECT_GUARD };
