import { describe, expect, it } from "vitest";

import {
  buildLeadFieldProvenance,
  canApplyIntelligenceValue,
  hubspotPropertiesIndicateCmp,
  mapHubSpotStateRegion,
  parseHubSpotContactIdFromIdempotencyKey,
  planIntelligenceFieldWrites,
  readHubSpotContactIdFromLeadAttributes,
} from "@/lib/lead-intelligence";

describe("lead intelligence contract", () => {
  it("parses HubSpot contact idempotency keys and attributes", () => {
    expect(parseHubSpotContactIdFromIdempotencyKey("hubspot:contact:99")).toBe("99");
    expect(parseHubSpotContactIdFromIdempotencyKey("website:form-1")).toBeNull();
    expect(
      readHubSpotContactIdFromLeadAttributes({
        integration: { inboundSource: "hubspot", externalId: "hs-1" },
      }),
    ).toBe("hs-1");
  });

  it("treats CMP product tokens as HubSpot CMP contacts", () => {
    expect(hubspotPropertiesIndicateCmp("CMP")).toBe(true);
    expect(hubspotPropertiesIndicateCmp("WD; CMP")).toBe(true);
    expect(hubspotPropertiesIndicateCmp("WD")).toBe(false);
  });

  it("prefers HubSpot state over state code", () => {
    expect(mapHubSpotStateRegion({ state: "Geneva", hs_state_code: "GE" })).toBe("Geneva");
    expect(mapHubSpotStateRegion({ state: null, hs_state_code: "GE" })).toBe("GE");
  });

  it("applies only blank or HubSpot-owned values and preserves manual clears", () => {
    expect(
      canApplyIntelligenceValue({
        existingValue: null,
        existingProvenance: null,
        incomingValue: "Finance",
      }),
    ).toBe("apply");
    expect(
      canApplyIntelligenceValue({
        existingValue: "",
        existingProvenance: { method: "manual", source: "lead_update", appliedAt: "", notes: null },
        incomingValue: "Finance",
      }),
    ).toBe("skip_preserved");
    expect(
      canApplyIntelligenceValue({
        existingValue: "Old",
        existingProvenance: { method: "hubspot", source: "hubspot", appliedAt: "", notes: null },
        incomingValue: "New",
      }),
    ).toBe("apply");
    expect(
      canApplyIntelligenceValue({
        existingValue: "Manual",
        existingProvenance: { method: "manual", source: "lead_update", appliedAt: "", notes: null },
        incomingValue: "HubSpot",
      }),
    ).toBe("skip_preserved");
    expect(
      canApplyIntelligenceValue({
        existingValue: null,
        existingProvenance: null,
        incomingValue: "  ",
      }),
    ).toBe("skip_blank_incoming");
  });

  it("plans non-destructive field writes with provenance", () => {
    const planned = planIntelligenceFieldWrites({
      existing: {
        industry: "Manual industry",
        jobTitle: null,
        stateRegion: "Vaud",
        companyId: null,
      },
      incoming: {
        industry: "HubSpot industry",
        jobTitle: "Analyst",
        stateRegion: "Geneva",
        companyId: "company-1",
      },
      existingProvenance: {
        industry: buildLeadFieldProvenance({ method: "manual", source: "lead_update" }),
        stateRegion: buildLeadFieldProvenance({ method: "hubspot", source: "hubspot" }),
      },
      incomingProvenance: buildLeadFieldProvenance({
        method: "hubspot",
        source: "hubspot_cmp_enrichment",
      }),
    });

    expect(planned.applied).toEqual(["jobTitle", "stateRegion", "companyId"]);
    expect(planned.values).toEqual({
      jobTitle: "Analyst",
      stateRegion: "Geneva",
      companyId: "company-1",
    });
    expect(planned.skipped).toEqual([
      { field: "industry", reason: "skip_preserved" },
    ]);
  });
});
