/**
 * Distinguishes genuine inbound acquisition from CRM created/imported/migrated timing.
 *
 * Campaign enrollment still uses `isHubSpotOrLegacyMigratedLead` (live HubSpot + GV/WD).
 * Analytics must split those: live HubSpot webhook is inbound; GV/WD and CSV imports are not.
 */
import { CAMPAIGN_GUARD_SOURCE } from "@/lib/campaign-enrollment-guard";
import { HUBSPOT_CMP_INTELLIGENCE_SOURCE } from "@/lib/hubspot-cmp-lead-intelligence";
import {
  hubspotPropertiesIndicateCmp,
  type LeadIntelligenceProvenance,
} from "@/lib/lead-intelligence";

export const LIVE_HUBSPOT_INBOUND_SOURCE = "hubspot";

export const LEGACY_HUBSPOT_INBOUND_SOURCES = [
  "hubspot-gv-pilot",
  "hubspot-wd-project",
] as const;

export const CSV_IMPORT_KIND = "csv";
export const CSV_IMPORT_SOURCE = "lead_import";

export const LEAD_ACQUISITION_KINDS = ["genuine_inbound", "legacy_import"] as const;
export type LeadAcquisitionKind = (typeof LEAD_ACQUISITION_KINDS)[number];

/** HubSpot `product_intersted_in` token as stored on lead integration attributes. */
export const CMP_PRODUCT_TOKEN_MONGO_REGEX = "(^|[;|,])\\s*CMP\\s*([;|,]|$)";

export type LeadAcquisitionSnapshot = {
  attributes?: Record<string, unknown> | null;
  intelligenceProvenance?: LeadIntelligenceProvenance | null;
};

function readRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readIntegrationRecord(
  attributes: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const attrs = readRecord(attributes);
  return attrs ? readRecord(attrs.integration) : null;
}

function inboundSourceOf(
  attributes: Record<string, unknown> | null | undefined,
): string {
  const integration = readIntegrationRecord(attributes);
  return typeof integration?.inboundSource === "string" ? integration.inboundSource : "";
}

function hasCsvImportStamp(
  attributes: Record<string, unknown> | null | undefined,
): boolean {
  const attrs = readRecord(attributes);
  const stamped = readRecord(attrs?.import);
  if (!stamped) {
    return false;
  }
  return stamped.kind === CSV_IMPORT_KIND || stamped.source === CSV_IMPORT_SOURCE;
}

function intelligenceWasImported(
  provenance: LeadIntelligenceProvenance | null | undefined,
): boolean {
  if (!provenance) {
    return false;
  }
  return Object.values(provenance).some(
    (field) => field?.method === "import" || field?.source === CSV_IMPORT_SOURCE,
  );
}

function hasLegacyCampaignGuardWithoutLiveHubSpot(
  attributes: Record<string, unknown> | null | undefined,
): boolean {
  const attrs = readRecord(attributes);
  const policy = readRecord(attrs?.[ "campaignEnrollmentPolicy"]);
  if (!policy || policy.defaultExcluded !== true || policy.source !== CAMPAIGN_GUARD_SOURCE) {
    return false;
  }
  return inboundSourceOf(attributes) !== LIVE_HUBSPOT_INBOUND_SOURCE;
}

function hasLegacyHubSpotIdempotencyWithoutLiveSource(
  attributes: Record<string, unknown> | null | undefined,
): boolean {
  const integration = readIntegrationRecord(attributes);
  const key =
    typeof integration?.idempotencyKey === "string" ? integration.idempotencyKey : "";
  if (!key.startsWith("hubspot:contact:")) {
    return false;
  }
  return inboundSourceOf(attributes) !== LIVE_HUBSPOT_INBOUND_SOURCE;
}

export function isLegacyImportLead(lead: LeadAcquisitionSnapshot): boolean {
  const inboundSource = inboundSourceOf(lead.attributes);
  if ((LEGACY_HUBSPOT_INBOUND_SOURCES as readonly string[]).includes(inboundSource)) {
    return true;
  }
  if (hasCsvImportStamp(lead.attributes)) {
    return true;
  }
  if (intelligenceWasImported(lead.intelligenceProvenance)) {
    return true;
  }
  if (hasLegacyCampaignGuardWithoutLiveHubSpot(lead.attributes)) {
    return true;
  }
  return hasLegacyHubSpotIdempotencyWithoutLiveSource(lead.attributes);
}

export function classifyLeadAcquisition(lead: LeadAcquisitionSnapshot): LeadAcquisitionKind {
  return isLegacyImportLead(lead) ? "legacy_import" : "genuine_inbound";
}

export function buildCsvImportAttributes(importedAt: Date = new Date()): {
  import: { kind: typeof CSV_IMPORT_KIND; source: typeof CSV_IMPORT_SOURCE; importedAt: string };
} {
  return {
    import: {
      kind: CSV_IMPORT_KIND,
      source: CSV_IMPORT_SOURCE,
      importedAt: importedAt.toISOString(),
    },
  };
}

/** Mongo clause matching legacy HubSpot migrations and CSV imports. */
export function legacyImportMongoFilter(): Record<string, unknown> {
  return {
    $or: [
      {
        "attributes.integration.inboundSource": {
          $in: [...LEGACY_HUBSPOT_INBOUND_SOURCES],
        },
      },
      { "attributes.import.kind": CSV_IMPORT_KIND },
      { "attributes.import.source": CSV_IMPORT_SOURCE },
      { "intelligenceProvenance.industry.method": "import" },
      { "intelligenceProvenance.jobTitle.method": "import" },
      { "intelligenceProvenance.stateRegion.method": "import" },
      { "intelligenceProvenance.companyId.method": "import" },
      { "intelligenceProvenance.industry.source": CSV_IMPORT_SOURCE },
      { "intelligenceProvenance.jobTitle.source": CSV_IMPORT_SOURCE },
      { "intelligenceProvenance.stateRegion.source": CSV_IMPORT_SOURCE },
      { "intelligenceProvenance.companyId.source": CSV_IMPORT_SOURCE },
      {
        $and: [
          { "attributes.campaignEnrollmentPolicy.defaultExcluded": true },
          { "attributes.campaignEnrollmentPolicy.source": CAMPAIGN_GUARD_SOURCE },
          {
            $or: [
              { "attributes.integration.inboundSource": { $exists: false } },
              { "attributes.integration.inboundSource": null },
              { "attributes.integration.inboundSource": { $ne: LIVE_HUBSPOT_INBOUND_SOURCE } },
            ],
          },
        ],
      },
      {
        $and: [
          { "attributes.integration.idempotencyKey": { $regex: "^hubspot:contact:" } },
          {
            $or: [
              { "attributes.integration.inboundSource": { $exists: false } },
              { "attributes.integration.inboundSource": null },
              { "attributes.integration.inboundSource": { $ne: LIVE_HUBSPOT_INBOUND_SOURCE } },
            ],
          },
        ],
      },
    ],
  };
}

export function withLeadAcquisitionFilter(
  query: Record<string, unknown>,
  acquisition: LeadAcquisitionKind | "all" | undefined,
): Record<string, unknown> {
  if (!acquisition || acquisition === "all") {
    return query;
  }
  if (acquisition === "legacy_import") {
    return {
      $and: [query, legacyImportMongoFilter()],
    };
  }
  return {
    ...query,
    $nor: [legacyImportMongoFilter()],
  };
}

function productInterestFromAttributes(
  attributes: Record<string, unknown> | null | undefined,
): string | null {
  const integration = readIntegrationRecord(attributes);
  const fromCanonical =
    typeof integration?.productInterestedIn === "string" ? integration.productInterestedIn : null;
  const fromHubSpotKey =
    typeof integration?.product_intersted_in === "string" ? integration.product_intersted_in : null;
  return fromCanonical || fromHubSpotKey;
}

function intelligenceSourceIsCmpEnrichment(
  provenance: LeadIntelligenceProvenance | null | undefined,
): boolean {
  if (!provenance) {
    return false;
  }
  return Object.values(provenance).some(
    (field) => field?.source === HUBSPOT_CMP_INTELLIGENCE_SOURCE,
  );
}

export function leadIndicatesCmpSourceCohort(lead: LeadAcquisitionSnapshot): boolean {
  if (hubspotPropertiesIndicateCmp(productInterestFromAttributes(lead.attributes))) {
    return true;
  }
  return intelligenceSourceIsCmpEnrichment(lead.intelligenceProvenance);
}

export function cmpSourceCohortMongoFilter(): Record<string, unknown> {
  return {
    $or: [
      {
        "attributes.integration.productInterestedIn": {
          $regex: CMP_PRODUCT_TOKEN_MONGO_REGEX,
          $options: "i",
        },
      },
      {
        "attributes.integration.product_intersted_in": {
          $regex: CMP_PRODUCT_TOKEN_MONGO_REGEX,
          $options: "i",
        },
      },
      { "intelligenceProvenance.industry.source": HUBSPOT_CMP_INTELLIGENCE_SOURCE },
      { "intelligenceProvenance.jobTitle.source": HUBSPOT_CMP_INTELLIGENCE_SOURCE },
      { "intelligenceProvenance.stateRegion.source": HUBSPOT_CMP_INTELLIGENCE_SOURCE },
      { "intelligenceProvenance.companyId.source": HUBSPOT_CMP_INTELLIGENCE_SOURCE },
    ],
  };
}

/** CRM project identity for HubSpot CMP / CMP_Emailing_BE — not substrings like "campanules". */
export function isCmpCrmProjectIdentity(
  name?: string | null,
  reference?: string | null,
): boolean {
  return [name, reference].some((value) => {
    if (!value?.trim()) {
      return false;
    }
    const trimmed = value.trim();
    return /^cmp$/i.test(trimmed) || /^cmp[_-\s]/i.test(trimmed);
  });
}
