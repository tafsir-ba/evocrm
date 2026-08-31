import { describe, expect, it } from "vitest";

import {
  HUBSPOT_CMP_INTELLIGENCE_SIDE_EFFECT_GUARD,
  planHubSpotCmpLeadIntelligence,
} from "@/lib/hubspot-cmp-lead-intelligence";

const snapshot = {
  contactId: "99",
  properties: {
    industry: "Finance",
    jobtitle: "Analyst",
    state: "Geneva",
    company: "Analytical Engines",
    product_intersted_in: "CMP",
  },
};

describe("HubSpot CMP lead intelligence planner", () => {
  it("never enrolls campaigns or mutates project, status, or consent", () => {
    expect(HUBSPOT_CMP_INTELLIGENCE_SIDE_EFFECT_GUARD).toEqual({
      triggerAutomation: false,
      enrollCampaigns: false,
      enrollDrips: false,
      mutateLeadProject: false,
      mutateLeadStatus: false,
      mutateLeadSource: false,
      mutateSourceDates: false,
      mutateConsent: false,
      mutateMemberships: false,
    });
  });

  it("skips contacts that are not CMP when required", () => {
    const plan = planHubSpotCmpLeadIntelligence({
      snapshot: {
        ...snapshot,
        properties: { ...snapshot.properties, product_intersted_in: "WD" },
      },
      existing: {
        industry: null,
        jobTitle: null,
        stateRegion: null,
        companyId: null,
      },
    });

    expect(plan.eligible).toBe(false);
    expect(plan.reason).toBe("not_cmp_product");
    expect(plan.applied).toEqual([]);
  });

  it("fills blank CMP fields and preserves manual CRM values", () => {
    const plan = planHubSpotCmpLeadIntelligence({
      snapshot,
      existing: {
        industry: "Private banking",
        jobTitle: null,
        stateRegion: null,
        companyId: "manual-co",
      },
      existingProvenance: {
        industry: {
          method: "manual",
          source: "lead_update",
          appliedAt: "2026-08-01T00:00:00.000Z",
          notes: null,
        },
        companyId: {
          method: "manual",
          source: "lead_update",
          appliedAt: "2026-08-01T00:00:00.000Z",
          notes: null,
        },
      },
      resolvedCompanyId: "hubspot-co",
    });

    expect(plan.eligible).toBe(true);
    expect(plan.applied).toEqual(["jobTitle", "stateRegion"]);
    expect(plan.values).toEqual({
      jobTitle: "Analyst",
      stateRegion: "Geneva",
    });
    expect(plan.skipped.map((item) => item.field)).toEqual(["industry", "companyId"]);
  });

  it("is idempotent when HubSpot-owned values are unchanged", () => {
    const plan = planHubSpotCmpLeadIntelligence({
      snapshot,
      existing: {
        industry: "Finance",
        jobTitle: "Analyst",
        stateRegion: "Geneva",
        companyId: "co-1",
      },
      existingProvenance: {
        industry: {
          method: "hubspot",
          source: "hubspot_cmp_enrichment",
          appliedAt: "2026-08-01T00:00:00.000Z",
          notes: null,
        },
        jobTitle: {
          method: "hubspot",
          source: "hubspot_cmp_enrichment",
          appliedAt: "2026-08-01T00:00:00.000Z",
          notes: null,
        },
        stateRegion: {
          method: "hubspot",
          source: "hubspot_cmp_enrichment",
          appliedAt: "2026-08-01T00:00:00.000Z",
          notes: null,
        },
        companyId: {
          method: "hubspot",
          source: "hubspot_cmp_enrichment",
          appliedAt: "2026-08-01T00:00:00.000Z",
          notes: null,
        },
      },
      resolvedCompanyId: "co-1",
    });

    expect(plan.applied).toEqual([]);
    expect(plan.skipped.every((item) => item.reason === "skip_unchanged")).toBe(true);
  });
});
