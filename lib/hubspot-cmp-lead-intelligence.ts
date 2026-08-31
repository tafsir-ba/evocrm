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

export const HUBSPOT_CMP_INTELLIGENCE_SIDE_EFFECT_GUARD = {
  triggerAutomation: false as const,
  enrollCampaigns: false as const,
  enrollDrips: false as const,
};

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
