import {
  buildLeadFieldProvenance,
  hubspotPropertiesIndicateCmp,
  mapHubSpotStateRegion,
  normalizeIntelligenceText,
  planIntelligenceFieldWrites,
  type LeadFieldProvenance,
  type LeadIntelligenceProvenance,
  type LeadIntelligenceValues,
} from "@/lib/lead-intelligence";

export const HUBSPOT_CMP_INTELLIGENCE_SOURCE = "hubspot_cmp_enrichment";

export const HUBSPOT_CMP_INTELLIGENCE_SIDE_EFFECT_GUARD = Object.freeze({
  triggerAutomation: false as const,
  enrollCampaigns: false as const,
  enrollDrips: false as const,
  mutateLeadProject: false as const,
  mutateLeadStatus: false as const,
  mutateLeadSource: false as const,
  mutateSourceDates: false as const,
  mutateConsent: false as const,
  mutateMemberships: false as const,
});

export const CMP_INTELLIGENCE_WRITE_FIELDS = [
  "industry",
  "jobTitle",
  "stateRegion",
  "companyId",
] as const;

export function assertCmpIntelligenceWritePayload(
  values: Record<string, unknown>,
): void {
  const allowed = new Set<string>(CMP_INTELLIGENCE_WRITE_FIELDS);
  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) {
      throw new Error(`cmp_enrichment_forbidden_field:${key}`);
    }
  }
}

export type HubSpotIntelligenceContactSnapshot = {
  contactId: string;
  properties: {
    industry?: string | null;
    jobtitle?: string | null;
    state?: string | null;
    hs_state_code?: string | null;
    company?: string | null;
    associatedcompanyid?: string | null;
    product_intersted_in?: string | null;
  };
};

export type HubSpotIntelligencePlan = {
  eligible: boolean;
  reason: string;
  companyName: string | null;
  hubspotCompanyId: string | null;
  incoming: Partial<LeadIntelligenceValues>;
  applied: ReturnType<typeof planIntelligenceFieldWrites>["applied"];
  skipped: ReturnType<typeof planIntelligenceFieldWrites>["skipped"];
  values: Partial<LeadIntelligenceValues>;
  provenance: LeadIntelligenceProvenance;
  provenanceStamp: LeadFieldProvenance;
};

export function isCmpHubSpotContact(snapshot: HubSpotIntelligenceContactSnapshot): boolean {
  return hubspotPropertiesIndicateCmp(snapshot.properties.product_intersted_in);
}

export function planHubSpotCmpLeadIntelligence(input: {
  snapshot: HubSpotIntelligenceContactSnapshot;
  existing: LeadIntelligenceValues;
  existingProvenance?: LeadIntelligenceProvenance | null;
  resolvedCompanyId?: string | null;
  appliedAt?: string;
  requireCmpProduct?: boolean;
}): HubSpotIntelligencePlan {
  const requireCmp = input.requireCmpProduct !== false;
  const isCmp = isCmpHubSpotContact(input.snapshot);
  const provenanceStamp = buildLeadFieldProvenance({
    method: "hubspot",
    source: HUBSPOT_CMP_INTELLIGENCE_SOURCE,
    appliedAt: input.appliedAt,
    notes: isCmp
      ? "HubSpot CMP contact intelligence. Does not enroll campaigns."
      : "HubSpot contact intelligence. Does not enroll campaigns.",
  });

  if (requireCmp && !isCmp) {
    return {
      eligible: false,
      reason: "not_cmp_product",
      companyName: normalizeIntelligenceText(input.snapshot.properties.company),
      hubspotCompanyId: normalizeIntelligenceText(input.snapshot.properties.associatedcompanyid),
      incoming: {},
      applied: [],
      skipped: [],
      values: {},
      provenance: {},
      provenanceStamp,
    };
  }

  const incoming: Partial<LeadIntelligenceValues> = {
    industry: normalizeIntelligenceText(input.snapshot.properties.industry),
    jobTitle: normalizeIntelligenceText(input.snapshot.properties.jobtitle),
    stateRegion: mapHubSpotStateRegion(input.snapshot.properties),
    companyId: normalizeIntelligenceText(input.resolvedCompanyId),
  };

  const planned = planIntelligenceFieldWrites({
    existing: input.existing,
    incoming,
    existingProvenance: input.existingProvenance,
    incomingProvenance: provenanceStamp,
  });

  return {
    eligible: true,
    reason: isCmp ? "cmp_product" : "hubspot_contact",
    companyName: normalizeIntelligenceText(input.snapshot.properties.company),
    hubspotCompanyId: normalizeIntelligenceText(input.snapshot.properties.associatedcompanyid),
    incoming,
    applied: planned.applied,
    skipped: planned.skipped,
    values: planned.values,
    provenance: planned.provenance,
    provenanceStamp,
  };
}

export type CmpIntelligenceFieldCounts = Record<
  "industry" | "jobTitle" | "stateRegion" | "companyId",
  number
>;

export type CmpIntelligenceMatchMethod = "hubspot_contact_id" | "unique_email" | "none";

export type CmpIntelligenceAuditSample = {
  leadId: string;
  contactId: string | null;
  matchMethod: CmpIntelligenceMatchMethod;
  applied: string[];
  skipped: Array<{ field: string; reason: string }>;
  errorCode?: string;
};

export type CmpIntelligenceRow = {
  leadId: string;
  contactId: string | null;
  matchMethod: CmpIntelligenceMatchMethod;
  eligible: boolean;
  reason: string;
  applied: string[];
  skipped: Array<{ field: string; reason: string }>;
  incomingAvailable: Array<"industry" | "jobTitle" | "stateRegion" | "companyId">;
  persisted: boolean;
  errorCode?: string;
};

export function emptyCmpIntelligenceFieldCounts(): CmpIntelligenceFieldCounts {
  return { industry: 0, jobTitle: 0, stateRegion: 0, companyId: 0 };
}

export function summarizeCmpIntelligenceRows(
  rows: CmpIntelligenceRow[],
  input: { persisted: boolean; persistReason: string | null; sampleLimit?: number },
): {
  mode: "dry-run" | "execute";
  persisted: boolean;
  persistReason: string | null;
  cmpLeadsScanned: number;
  hubspotMatches: number;
  unmatchedContacts: number;
  unmatchedMissingId: number;
  unmatchedNotFound: number;
  unmatchedAmbiguousEmail: number;
  errors: number;
  valuesAvailable: CmpIntelligenceFieldCounts;
  wouldChangeRecords: number;
  wouldChangeFields: CmpIntelligenceFieldCounts;
  filledRecords: number;
  filledFields: CmpIntelligenceFieldCounts;
  skippedUnchanged: number;
  skippedPreserved: number;
  samples: CmpIntelligenceAuditSample[];
} {
  const valuesAvailable = emptyCmpIntelligenceFieldCounts();
  const wouldChangeFields = emptyCmpIntelligenceFieldCounts();
  const filledFields = emptyCmpIntelligenceFieldCounts();
  const sampleLimit = input.sampleLimit ?? 40;
  const samples: CmpIntelligenceAuditSample[] = [];

  let hubspotMatches = 0;
  let unmatchedMissingId = 0;
  let unmatchedNotFound = 0;
  let unmatchedAmbiguousEmail = 0;
  let errors = 0;
  let wouldChangeRecords = 0;
  let filledRecords = 0;
  let skippedUnchanged = 0;
  let skippedPreserved = 0;

  for (const row of rows) {
    if (row.errorCode) {
      errors += 1;
    }
    if (row.matchMethod !== "none" && row.contactId) {
      hubspotMatches += 1;
    }
    if (row.reason === "missing_hubspot_contact_id") {
      unmatchedMissingId += 1;
    }
    if (row.reason === "hubspot_contact_not_found") {
      unmatchedNotFound += 1;
    }
    if (row.reason === "email_ambiguous") {
      unmatchedAmbiguousEmail += 1;
    }
    for (const field of row.incomingAvailable) {
      valuesAvailable[field] += 1;
    }
    if (row.applied.length > 0) {
      wouldChangeRecords += 1;
      for (const field of row.applied) {
        if (field in wouldChangeFields) {
          wouldChangeFields[field as keyof CmpIntelligenceFieldCounts] += 1;
        }
      }
    }
    if (row.persisted) {
      filledRecords += 1;
      for (const field of row.applied) {
        if (field in filledFields) {
          filledFields[field as keyof CmpIntelligenceFieldCounts] += 1;
        }
      }
    }
    for (const skipped of row.skipped) {
      if (skipped.reason === "skip_unchanged") {
        skippedUnchanged += 1;
      }
      if (skipped.reason === "skip_preserved") {
        skippedPreserved += 1;
      }
    }
    const interesting =
      Boolean(row.errorCode) || row.applied.length > 0 || row.matchMethod === "none";
    if (interesting && samples.length < sampleLimit) {
      samples.push({
        leadId: row.leadId,
        contactId: row.contactId,
        matchMethod: row.matchMethod,
        applied: row.applied,
        skipped: row.skipped,
        ...(row.errorCode ? { errorCode: row.errorCode } : {}),
      });
    }
  }

  return {
    mode: input.persisted ? "execute" : "dry-run",
    persisted: input.persisted,
    persistReason: input.persistReason,
    cmpLeadsScanned: rows.length,
    hubspotMatches,
    unmatchedContacts: unmatchedMissingId + unmatchedNotFound + unmatchedAmbiguousEmail,
    unmatchedMissingId,
    unmatchedNotFound,
    unmatchedAmbiguousEmail,
    errors,
    valuesAvailable,
    wouldChangeRecords,
    wouldChangeFields,
    filledRecords,
    filledFields,
    skippedUnchanged,
    skippedPreserved,
    samples,
  };
}
