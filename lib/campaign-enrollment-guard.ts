/**
 * Permanent automatic-enrollment guard for HubSpot / legacy-migrated contacts.
 *
 * Migrated records are blocked from every automatic drip, workflow, and
 * campaign enrollment route. A user who already has campaign:update may
 * still enroll one deliberately via the existing manual enrollment API;
 * that path keeps its normal audit trail. No new role or permission.
 */

export const HUBSPOT_CONTACT_IDEMPOTENCY_PREFIX = "hubspot:contact:";

export const HUBSPOT_MIGRATED_INBOUND_SOURCES = [
  "hubspot",
  "hubspot-gv-pilot",
  "hubspot-wd-project",
] as const;

export const CAMPAIGN_ENROLLMENT_POLICY_KEY = "campaignEnrollmentPolicy";

export const CAMPAIGN_GUARD_SOURCE = "hubspot_legacy_migration";

export const AUTOMATIC_ENROLLMENT_SOURCES = [
  "project_auto_enroll",
  "rule_based_auto_enrollment",
] as const;

export type AutomaticEnrollmentSource = (typeof AUTOMATIC_ENROLLMENT_SOURCES)[number];

export type CampaignEnrollmentPolicy = {
  defaultExcluded: true;
  source: typeof CAMPAIGN_GUARD_SOURCE;
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

export function readCampaignEnrollmentPolicy(
  attributes: Record<string, unknown> | null | undefined,
): CampaignEnrollmentPolicy | null {
  if (!attributes || typeof attributes !== "object") {
    return null;
  }
  const raw = attributes[CAMPAIGN_ENROLLMENT_POLICY_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const policy = raw as Record<string, unknown>;
  if (policy.defaultExcluded !== true || policy.source !== CAMPAIGN_GUARD_SOURCE) {
    return null;
  }
  return {
    defaultExcluded: true,
    source: CAMPAIGN_GUARD_SOURCE,
  };
}

export function isHubSpotOrLegacyMigratedLead(
  attributes: Record<string, unknown> | null | undefined,
): boolean {
  if (readCampaignEnrollmentPolicy(attributes)) {
    return true;
  }
  const integration = readIntegrationRecord(attributes);
  if (!integration) {
    return false;
  }
  const idempotencyKey =
    typeof integration.idempotencyKey === "string" ? integration.idempotencyKey : "";
  if (idempotencyKey.startsWith(HUBSPOT_CONTACT_IDEMPOTENCY_PREFIX)) {
    return true;
  }
  const inboundSource =
    typeof integration.inboundSource === "string" ? integration.inboundSource : "";
  return (HUBSPOT_MIGRATED_INBOUND_SOURCES as readonly string[]).includes(inboundSource);
}

export function isAutomaticEnrollmentSource(
  source: string | null | undefined,
): source is AutomaticEnrollmentSource {
  return (AUTOMATIC_ENROLLMENT_SOURCES as readonly string[]).includes(source ?? "");
}

/** True when automatic/drip/workflow enrollment must skip this lead. */
export function isBlockedFromAutomaticCampaignEnrollment(
  attributes: Record<string, unknown> | null | undefined,
): boolean {
  return isHubSpotOrLegacyMigratedLead(attributes);
}

export function buildMigratedCampaignGuardAttributes(): {
  [CAMPAIGN_ENROLLMENT_POLICY_KEY]: CampaignEnrollmentPolicy;
} {
  return {
    [CAMPAIGN_ENROLLMENT_POLICY_KEY]: {
      defaultExcluded: true,
      source: CAMPAIGN_GUARD_SOURCE,
    },
  };
}

export const CAMPAIGN_GUARD_BLOCK_REASON = "campaign_guard_migrated_lead";
