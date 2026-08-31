/**
 * Pure planner for the ongoing HubSpot → EvoHome lead sync (not GV/WD backfill).
 * No I/O. Never include PII in reports.
 */

import { createHash } from "node:crypto";

import {
  CAMPAIGN_ENROLLMENT_POLICY_KEY,
  HUBSPOT_CONTACT_IDEMPOTENCY_PREFIX,
  ORGANIC_INBOUND_CHANNEL,
  buildMigratedCampaignGuardAttributes,
  type CampaignEnrollmentPolicy,
} from "@/lib/campaign-enrollment-guard";
import { LIVE_HUBSPOT_INBOUND_SOURCE } from "@/lib/inbound-acquisition";
import {
  canApplyIntelligenceValue,
  type IntelligenceApplyDecision,
} from "@/lib/lead-intelligence";

export const HUBSPOT_ONGOING_SYNC_INTELLIGENCE_SOURCE = "hubspot_ongoing_sync";

export const HUBSPOT_ONGOING_SYNC_RELEASE_GATES = ["off", "dry-run", "enabled"] as const;
export type HubSpotOngoingSyncReleaseGate =
  (typeof HUBSPOT_ONGOING_SYNC_RELEASE_GATES)[number];

export const HUBSPOT_SYNC_CURSOR_STATUSES = [
  "pending_cutover",
  "dry_run_verified",
  "active",
  "paused",
] as const;
export type HubSpotSyncCursorStatus = (typeof HUBSPOT_SYNC_CURSOR_STATUSES)[number];

export const HUBSPOT_SYNC_EVENT_STATUSES = [
  "received",
  "processed",
  "skipped",
  "failed",
  "dead_letter",
] as const;
export type HubSpotSyncEventStatus = (typeof HUBSPOT_SYNC_EVENT_STATUSES)[number];

export const HUBSPOT_SYNC_OUTCOMES = [
  "would_create",
  "would_update",
  "created",
  "updated",
  "duplicate",
  "skipped",
  "parked",
  "failed",
] as const;
export type HubSpotSyncOutcome = (typeof HUBSPOT_SYNC_OUTCOMES)[number];

export const HUBSPOT_SYNC_DEAD_LETTER_AFTER_ATTEMPTS = 5;

export { ORGANIC_INBOUND_CHANNEL };
export const HUBSPOT_SOURCED_CHANNEL = "hubspot_sourced";
export type HubSpotAcquisitionChannel =
  | typeof ORGANIC_INBOUND_CHANNEL
  | typeof HUBSPOT_SOURCED_CHANNEL;

export const HUBSPOT_ONGOING_SYNC_SIDE_EFFECT_GUARD = Object.freeze({
  triggerAutomation: false,
  enrollCampaigns: false,
  enrollDrips: false,
  applyHeldCohort: false,
  allowGeneralProject: false,
});

export const ORGANIC_HUBSPOT_ANALYTICS_SOURCES = [
  "ORGANIC_SEARCH",
  "DIRECT_TRAFFIC",
  "REFERRALS",
  "SOCIAL_MEDIA",
] as const;

export const NON_ORGANIC_HUBSPOT_ANALYTICS_SOURCES = [
  "EMAIL_MARKETING",
  "PAID_SEARCH",
  "PAID_SOCIAL",
  "OTHER_CAMPAIGNS",
  "OFFLINE",
  "INTEGRATIONS",
] as const;

export const NON_ORGANIC_HUBSPOT_OBJECT_SOURCES = ["IMPORT", "CRM_UI", "API"] as const;

export const HUBSPOT_ONGOING_CONTACT_PROPERTIES = [
  "firstname",
  "lastname",
  "email",
  "phone",
  "mobilephone",
  "company",
  "jobtitle",
  "industry",
  "state",
  "hs_state_code",
  "associatedcompanyid",
  "product_intersted_in",
  "wd_project",
  "city",
  "country",
  "message",
  "createdate",
  "hs_lastmodifieddate",
  "hs_analytics_source",
  "hs_analytics_source_data_1",
  "hs_analytics_source_data_2",
  "hs_latest_source",
  "hs_analytics_first_url",
  "hs_analytics_first_referrer",
  "hs_analytics_first_timestamp",
  "hs_object_source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export type HubSpotSyncIdentityField = "firstName" | "lastName" | "email" | "phone";

export const HUBSPOT_SYNC_IDENTITY_FIELDS: HubSpotSyncIdentityField[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
];

export type HubSpotFieldOwnership = {
  method: "hubspot" | "manual" | "website" | "api" | "import";
  source: string;
  appliedAt: string;
};

export type HubSpotOwnedFields = Partial<Record<HubSpotSyncIdentityField, HubSpotFieldOwnership>>;

export function parseHubSpotOngoingSyncReleaseGate(
  value: string | null | undefined,
): HubSpotOngoingSyncReleaseGate {
  const normalized = String(value ?? "off").trim().toLowerCase();
  if (normalized === "enabled" || normalized === "dry-run" || normalized === "off") {
    return normalized;
  }
  return "off";
}

export function envFlagEnabled(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export type HubSpotSyncMutationDecision = {
  ledger: boolean;
  plan: boolean;
  mutate: boolean;
  reason: string;
};

export function evaluateHubSpotSyncMutationGate(input: {
  releaseGate?: string | null;
  webhookMutate?: string | null;
  reconcileEnabled?: string | null;
  path: "webhook" | "reconcile" | "cutover";
  cursorStatus?: HubSpotSyncCursorStatus | null;
  dryRunVerifiedAt?: Date | string | null;
}): HubSpotSyncMutationDecision {
  const releaseGate = parseHubSpotOngoingSyncReleaseGate(input.releaseGate);
  const ledger = true;

  if (releaseGate === "off") {
    return { ledger, plan: false, mutate: false, reason: "release_gate_off" };
  }

  if (releaseGate === "dry-run") {
    return { ledger, plan: true, mutate: false, reason: "release_gate_dry_run" };
  }

  if (input.path === "webhook" && !envFlagEnabled(input.webhookMutate)) {
    return { ledger, plan: true, mutate: false, reason: "webhook_mutate_disabled" };
  }

  if (input.path === "reconcile" && !envFlagEnabled(input.reconcileEnabled)) {
    return { ledger, plan: true, mutate: false, reason: "reconcile_disabled" };
  }

  if (input.cursorStatus === "paused") {
    return { ledger, plan: true, mutate: false, reason: "cursor_paused" };
  }

  if (input.cursorStatus !== "active") {
    return { ledger, plan: true, mutate: false, reason: "cursor_not_active" };
  }

  if (!input.dryRunVerifiedAt) {
    return { ledger, plan: true, mutate: false, reason: "dry_run_not_verified" };
  }

  return { ledger, plan: true, mutate: true, reason: "mutate_allowed" };
}

export function hubspotOngoingContactIdempotencyKey(contactId: string): string {
  return `${HUBSPOT_CONTACT_IDEMPOTENCY_PREFIX}${String(contactId).trim()}`;
}

export function hashNormalizedEmailForKey(emailNormalized: string | null | undefined): string {
  const value = String(emailNormalized ?? "").trim().toLowerCase();
  if (!value) {
    return "none";
  }
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function hubspotSyncEventKey(input: {
  contactId: string;
  occurredAt?: number | string | null;
  lastModifiedAt?: string | null;
  subscriptionType?: string | null;
  eventId?: number | string | null;
  emailNormalized?: string | null;
}): string {
  const occurred =
    input.occurredAt == null || input.occurredAt === ""
      ? input.lastModifiedAt ?? "na"
      : String(input.occurredAt);
  const subscription = input.subscriptionType?.trim() || "contact.upsert";
  const eventId = input.eventId == null ? "na" : String(input.eventId);
  const emailHash = hashNormalizedEmailForKey(input.emailNormalized);
  return [
    "hubspot:event",
    String(input.contactId).trim(),
    occurred,
    subscription,
    eventId,
    emailHash,
  ].join(":");
}

export function hubspotContactVersionKey(contactId: string, lastModifiedAt: string | null): string {
  return `hubspot:contact-version:${String(contactId).trim()}:${lastModifiedAt ?? "na"}`;
}

export function parseOccurredAtMs(
  value: number | string | Date | null | undefined,
): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && /^\d+$/.test(value.trim())) {
      return asNumber;
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function isStaleHubSpotEvent(input: {
  incomingOccurredAt?: number | string | Date | null;
  lastProcessedOccurredAt?: number | string | Date | null;
}): boolean {
  const incoming = parseOccurredAtMs(input.incomingOccurredAt);
  const last = parseOccurredAtMs(input.lastProcessedOccurredAt);
  if (incoming == null || last == null) {
    return false;
  }
  return incoming < last;
}

export type HubSpotSourceClassification = {
  acquisitionChannel: HubSpotAcquisitionChannel;
  analyticsSource: string | null;
  objectSource: string | null;
  leadSourceKey: "website" | "hubspot" | "google_ads" | "meta_ads" | "referral";
  organic: boolean;
};

function normalizeSourceToken(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim().toUpperCase();
  return trimmed || null;
}

export function classifyHubSpotLeadSource(input: {
  analyticsSource?: string | null;
  latestSource?: string | null;
  objectSource?: string | null;
}): HubSpotSourceClassification {
  const analyticsSource =
    normalizeSourceToken(input.analyticsSource) ?? normalizeSourceToken(input.latestSource);
  const objectSource = normalizeSourceToken(input.objectSource);

  const objectBlocksOrganic =
    objectSource != null &&
    (NON_ORGANIC_HUBSPOT_OBJECT_SOURCES as readonly string[]).includes(objectSource);

  const nonOrganicAnalytics =
    analyticsSource != null &&
    (NON_ORGANIC_HUBSPOT_ANALYTICS_SOURCES as readonly string[]).includes(analyticsSource);

  const organicAnalytics =
    analyticsSource != null &&
    (ORGANIC_HUBSPOT_ANALYTICS_SOURCES as readonly string[]).includes(analyticsSource);

  const organic = organicAnalytics && !objectBlocksOrganic && !nonOrganicAnalytics;

  let leadSourceKey: HubSpotSourceClassification["leadSourceKey"] = "hubspot";
  if (organic) {
    leadSourceKey = analyticsSource === "REFERRALS" ? "referral" : "website";
  } else if (analyticsSource === "PAID_SEARCH") {
    leadSourceKey = "google_ads";
  } else if (analyticsSource === "PAID_SOCIAL") {
    leadSourceKey = "meta_ads";
  } else if (analyticsSource === "REFERRALS") {
    leadSourceKey = "referral";
  }

  return {
    acquisitionChannel: organic ? ORGANIC_INBOUND_CHANNEL : HUBSPOT_SOURCED_CHANNEL,
    analyticsSource,
    objectSource,
    leadSourceKey,
    organic,
  };
}

export type HubSpotWatermarkDecision =
  | { kind: "new_acquisition" }
  | { kind: "existing_update_only" }
  | { kind: "park"; reason: "pre_cutover_not_imported" };

export function evaluateHubSpotCutoverWatermark(input: {
  sourceCreatedAt?: string | Date | null;
  cutoverAt?: string | Date | null;
  existingLead: boolean;
}): HubSpotWatermarkDecision {
  if (!input.cutoverAt) {
    return input.existingLead
      ? { kind: "existing_update_only" }
      : { kind: "park", reason: "pre_cutover_not_imported" };
  }

  const created = parseOccurredAtMs(input.sourceCreatedAt);
  const cutover = parseOccurredAtMs(input.cutoverAt);
  if (created == null || cutover == null) {
    return input.existingLead
      ? { kind: "existing_update_only" }
      : { kind: "park", reason: "pre_cutover_not_imported" };
  }

  if (created > cutover) {
    return { kind: "new_acquisition" };
  }

  return input.existingLead
    ? { kind: "existing_update_only" }
    : { kind: "park", reason: "pre_cutover_not_imported" };
}

export function resolveHubSpotInboundDates(input: {
  sourceCreatedAt?: string | null;
  analyticsFirstTimestamp?: string | null;
  syncNow: Date;
  organic: boolean;
  newAcquisition: boolean;
}): {
  sourceCreatedAt: string | null;
  receivedAt: string | null;
  lastSyncedAt: string;
} {
  const sourceCreatedAt = input.sourceCreatedAt?.trim() || input.analyticsFirstTimestamp?.trim() || null;
  const lastSyncedAt = input.syncNow.toISOString();
  if (!input.newAcquisition) {
    return { sourceCreatedAt, receivedAt: sourceCreatedAt, lastSyncedAt };
  }
  const receivedAt = sourceCreatedAt;
  return { sourceCreatedAt, receivedAt, lastSyncedAt };
}

export function campaignAttributesForHubSpotSync(input: {
  organic: boolean;
  newAcquisition: boolean;
}): { [CAMPAIGN_ENROLLMENT_POLICY_KEY]?: CampaignEnrollmentPolicy } {
  if (input.organic && input.newAcquisition) {
    return {};
  }
  return buildMigratedCampaignGuardAttributes();
}

export function buildHubSpotOwnedFieldStamp(input: {
  appliedAt: Date | string;
  source?: string;
}): HubSpotFieldOwnership {
  const appliedAt =
    input.appliedAt instanceof Date ? input.appliedAt.toISOString() : input.appliedAt;
  return {
    method: "hubspot",
    source: input.source ?? HUBSPOT_ONGOING_SYNC_INTELLIGENCE_SOURCE,
    appliedAt,
  };
}

export function canApplyHubSpotIdentityField(input: {
  existingValue: string | null | undefined;
  incomingValue: string | null | undefined;
  ownership?: HubSpotFieldOwnership | null;
}): IntelligenceApplyDecision {
  return canApplyIntelligenceValue({
    existingValue: input.existingValue,
    incomingValue: input.incomingValue,
    existingProvenance: input.ownership
      ? {
          method: input.ownership.method === "hubspot" ? "hubspot" : "manual",
          source: input.ownership.source,
          appliedAt: input.ownership.appliedAt,
          notes: null,
        }
      : null,
  });
}

export function planHubSpotIdentityWrites(input: {
  existing: Partial<Record<HubSpotSyncIdentityField, string | null | undefined>>;
  incoming: Partial<Record<HubSpotSyncIdentityField, string | null | undefined>>;
  ownedFields?: HubSpotOwnedFields | null;
  appliedAt: Date | string;
}): {
  values: Partial<Record<HubSpotSyncIdentityField, string | null>>;
  ownedFields: HubSpotOwnedFields;
  applied: HubSpotSyncIdentityField[];
  skipped: Array<{ field: HubSpotSyncIdentityField; reason: IntelligenceApplyDecision }>;
} {
  const values: Partial<Record<HubSpotSyncIdentityField, string | null>> = {};
  const ownedFields: HubSpotOwnedFields = { ...(input.ownedFields ?? {}) };
  const applied: HubSpotSyncIdentityField[] = [];
  const skipped: Array<{ field: HubSpotSyncIdentityField; reason: IntelligenceApplyDecision }> = [];
  const stamp = buildHubSpotOwnedFieldStamp({ appliedAt: input.appliedAt });

  for (const field of HUBSPOT_SYNC_IDENTITY_FIELDS) {
    if (!(field in input.incoming)) {
      continue;
    }
    const decision = canApplyHubSpotIdentityField({
      existingValue: input.existing[field],
      incomingValue: input.incoming[field],
      ownership: input.ownedFields?.[field],
    });
    if (decision !== "apply") {
      skipped.push({ field, reason: decision });
      continue;
    }
    const next = String(input.incoming[field] ?? "").trim() || null;
    values[field] = next;
    ownedFields[field] = stamp;
    applied.push(field);
  }

  return { values, ownedFields, applied, skipped };
}

export function mergeLeadAttributesForHubSpotSync(input: {
  existing?: Record<string, unknown> | null;
  integrationPatch: Record<string, unknown>;
  campaignPolicy?: { [CAMPAIGN_ENROLLMENT_POLICY_KEY]?: CampaignEnrollmentPolicy };
  ownedFields?: HubSpotOwnedFields;
}): Record<string, unknown> {
  const existing = input.existing && typeof input.existing === "object" ? input.existing : {};
  const existingIntegration =
    existing.integration && typeof existing.integration === "object" && !Array.isArray(existing.integration)
      ? (existing.integration as Record<string, unknown>)
      : {};

  const next: Record<string, unknown> = {
    ...existing,
    integration: {
      ...existingIntegration,
      ...input.integrationPatch,
    },
  };

  if (input.ownedFields) {
    const integration = next.integration as Record<string, unknown>;
    integration.ownedFields = input.ownedFields;
  }

  const policy = input.campaignPolicy?.[CAMPAIGN_ENROLLMENT_POLICY_KEY];
  if (policy) {
    next[CAMPAIGN_ENROLLMENT_POLICY_KEY] = policy;
  }

  return next;
}

export function buildHubSpotSyncUtm(properties: Record<string, string | null | undefined>): {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
} | undefined {
  const utm = {
    ...(properties.utm_source?.trim()
      ? { source: properties.utm_source.trim() }
      : properties.hs_analytics_source?.trim()
        ? { source: properties.hs_analytics_source.trim() }
        : {}),
    ...(properties.utm_medium?.trim()
      ? { medium: properties.utm_medium.trim() }
      : {}),
    ...(properties.utm_campaign?.trim()
      ? { campaign: properties.utm_campaign.trim() }
      : properties.hs_analytics_source_data_1?.trim()
        ? { campaign: properties.hs_analytics_source_data_1.trim() }
        : {}),
    ...(properties.utm_term?.trim() ? { term: properties.utm_term.trim() } : {}),
    ...(properties.utm_content?.trim()
      ? { content: properties.utm_content.trim() }
      : properties.hs_analytics_source_data_2?.trim()
        ? { content: properties.hs_analytics_source_data_2.trim() }
        : {}),
  };
  return Object.keys(utm).length > 0 ? utm : undefined;
}

export function nextHubSpotSyncEventStatus(input: {
  attempts: number;
  failed: boolean;
}): HubSpotSyncEventStatus {
  if (!input.failed) {
    return "processed";
  }
  if (input.attempts >= HUBSPOT_SYNC_DEAD_LETTER_AFTER_ATTEMPTS) {
    return "dead_letter";
  }
  return "failed";
}

export function hubspotSyncReportCounts(input: {
  received: number;
  created: number;
  updated: number;
  duplicates: number;
  skipped: number;
  parked: number;
  failed: number;
  deadLetter: number;
  wouldCreate: number;
  wouldUpdate: number;
}): Record<string, number> {
  return {
    received: input.received,
    created: input.created,
    updated: input.updated,
    duplicates: input.duplicates,
    skipped: input.skipped,
    parked: input.parked,
    failed: input.failed,
    deadLetter: input.deadLetter,
    wouldCreate: input.wouldCreate,
    wouldUpdate: input.wouldUpdate,
  };
}

export function assertOngoingSyncSideEffectGuard(
  guard: typeof HUBSPOT_ONGOING_SYNC_SIDE_EFFECT_GUARD = HUBSPOT_ONGOING_SYNC_SIDE_EFFECT_GUARD,
): void {
  if (guard.triggerAutomation !== false || guard.enrollCampaigns !== false || guard.enrollDrips !== false) {
    throw new Error("side_effect_guard:campaign_enrollment_forbidden");
  }
  if (guard.applyHeldCohort) {
    throw new Error("side_effect_guard:held_cohort_forbidden");
  }
  if (guard.allowGeneralProject) {
    throw new Error("side_effect_guard:general_project_forbidden");
  }
}

export function isLiveHubSpotInboundSource(value: string | null | undefined): boolean {
  return value === LIVE_HUBSPOT_INBOUND_SOURCE;
}
