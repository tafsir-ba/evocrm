/**
 * Permanent campaign / drip / workflow enrollment guard.
 *
 * HubSpot and legacy-migrated contacts are excluded by default.
 * Only organic leads, or an explicit project marketing-manager opt-in,
 * may be enrolled.
 */

export const HUBSPOT_CONTACT_IDEMPOTENCY_PREFIX = "hubspot:contact:";

export const HUBSPOT_MIGRATED_INBOUND_SOURCES = [
  "hubspot",
  "hubspot-gv-pilot",
] as const;

export const CAMPAIGN_ENROLLMENT_POLICY_KEY = "campaignEnrollmentPolicy";

export const CAMPAIGN_GUARD_SOURCE = "hubspot_legacy_migration";

export type CampaignEnrollmentPolicy = {
  defaultExcluded: true;
  source: typeof CAMPAIGN_GUARD_SOURCE;
  marketingOptIn?: {
    enabled: boolean;
    actorId: string;
    at: string;
    role: "project_marketing_manager";
  };
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
  const optInRaw = policy.marketingOptIn;
  const marketingOptIn =
    optInRaw && typeof optInRaw === "object" && !Array.isArray(optInRaw)
      ? {
          enabled: (optInRaw as Record<string, unknown>).enabled === true,
          actorId: String((optInRaw as Record<string, unknown>).actorId ?? ""),
          at: String((optInRaw as Record<string, unknown>).at ?? ""),
          role: "project_marketing_manager" as const,
        }
      : undefined;
  return {
    defaultExcluded: true,
    source: CAMPAIGN_GUARD_SOURCE,
    ...(marketingOptIn ? { marketingOptIn } : {}),
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

export function hasProjectMarketingManagerOptIn(
  attributes: Record<string, unknown> | null | undefined,
): boolean {
  return readCampaignEnrollmentPolicy(attributes)?.marketingOptIn?.enabled === true;
}

export function canEnrollLeadInCampaigns(
  attributes: Record<string, unknown> | null | undefined,
): boolean {
  if (!isHubSpotOrLegacyMigratedLead(attributes)) {
    return true;
  }
  return hasProjectMarketingManagerOptIn(attributes);
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

export function buildMarketingManagerOptInPolicy(input: {
  actorId: string;
  at?: Date;
}): CampaignEnrollmentPolicy {
  return {
    defaultExcluded: true,
    source: CAMPAIGN_GUARD_SOURCE,
    marketingOptIn: {
      enabled: true,
      actorId: input.actorId,
      at: (input.at ?? new Date()).toISOString(),
      role: "project_marketing_manager",
    },
  };
}

export const CAMPAIGN_GUARD_BLOCK_REASON = "campaign_guard_migrated_lead";

export function campaignGuardMongoExclusion(): Record<string, unknown> {
  return {
    $and: [
      {
        $or: [
          {
            "attributes.integration.idempotencyKey": {
              $regex: `^${HUBSPOT_CONTACT_IDEMPOTENCY_PREFIX}`,
            },
          },
          {
            "attributes.integration.inboundSource": {
              $in: [...HUBSPOT_MIGRATED_INBOUND_SOURCES],
            },
          },
          { "attributes.campaignEnrollmentPolicy.defaultExcluded": true },
        ],
      },
      { "attributes.campaignEnrollmentPolicy.marketingOptIn.enabled": { $ne: true } },
    ],
  };
}
