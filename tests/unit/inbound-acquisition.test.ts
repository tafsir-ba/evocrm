import { describe, expect, it } from "vitest";

import { buildMigratedCampaignGuardAttributes } from "@/lib/campaign-enrollment-guard";
import {
  classifyLeadAcquisition,
  isCmpCrmProjectIdentity,
  isLegacyImportLead,
  leadIndicatesCmpSourceCohort,
  withLeadAcquisitionFilter,
} from "@/lib/inbound-acquisition";
import { HUBSPOT_CMP_INTELLIGENCE_SOURCE } from "@/lib/hubspot-cmp-lead-intelligence";

const augustCreated = new Date("2026-08-12T10:00:00.000Z");

describe("inbound acquisition classification", () => {
  it("treats website and live HubSpot captures as genuine inbound", () => {
    expect(
      classifyLeadAcquisition({
        attributes: {
          integration: {
            integrationId: "int-web",
            inboundSource: "landing-hero",
            receivedAt: "2026-08-20T09:00:00.000Z",
          },
        },
      }),
    ).toBe("genuine_inbound");

    expect(
      classifyLeadAcquisition({
        attributes: {
          integration: {
            inboundSource: "hubspot",
            idempotencyKey: "hubspot:contact:99",
            sourceCreatedAt: "2024-01-01T00:00:00.000Z",
          },
          ...buildMigratedCampaignGuardAttributes(),
        },
      }),
    ).toBe("genuine_inbound");
  });

  it("treats organic CRM creates as genuine inbound", () => {
    expect(classifyLeadAcquisition({ attributes: {} })).toBe("genuine_inbound");
    expect(classifyLeadAcquisition({ attributes: null })).toBe("genuine_inbound");
  });

  it("excludes GV/WD HubSpot migrations even when CRM createdAt is this month", () => {
    const gv = {
      createdAt: augustCreated,
      attributes: {
        integration: {
          inboundSource: "hubspot-gv-pilot",
          idempotencyKey: "hubspot:contact:1363451",
        },
        ...buildMigratedCampaignGuardAttributes(),
      },
    };
    const wd = {
      createdAt: augustCreated,
      attributes: {
        integration: {
          inboundSource: "hubspot-wd-project",
          idempotencyKey: "hubspot:contact:1",
        },
        ...buildMigratedCampaignGuardAttributes(),
      },
    };

    expect(isLegacyImportLead(gv)).toBe(true);
    expect(isLegacyImportLead(wd)).toBe(true);
    expect(classifyLeadAcquisition(gv)).toBe("legacy_import");
  });

  it("excludes CSV imports by stamp or intelligence provenance", () => {
    expect(
      classifyLeadAcquisition({
        attributes: { import: { kind: "csv", source: "lead_import", importedAt: augustCreated.toISOString() } },
      }),
    ).toBe("legacy_import");

    expect(
      classifyLeadAcquisition({
        attributes: {},
        intelligenceProvenance: {
          industry: {
            method: "import",
            source: "lead_import",
            appliedAt: augustCreated.toISOString(),
            notes: null,
          },
        },
      }),
    ).toBe("legacy_import");
  });

  it("does not treat campaign-guarded live HubSpot as a legacy import", () => {
    expect(
      isLegacyImportLead({
        attributes: {
          integration: { inboundSource: "hubspot", idempotencyKey: "hubspot:contact:7" },
          ...buildMigratedCampaignGuardAttributes(),
        },
      }),
    ).toBe(false);
  });

  it("applies genuine vs legacy mongo filters without blending", () => {
    const base = { archivedAt: null, createdAt: { $gte: augustCreated } };
    expect(withLeadAcquisitionFilter(base, "genuine_inbound")).toEqual(
      expect.objectContaining({
        archivedAt: null,
        $nor: [expect.objectContaining({ $or: expect.any(Array) })],
      }),
    );
    expect(withLeadAcquisitionFilter(base, "legacy_import")).toEqual({
      $and: [base, expect.objectContaining({ $or: expect.any(Array) })],
    });
    expect(withLeadAcquisitionFilter(base, "all")).toEqual(base);
  });
});

describe("CMP source vs CRM project identity", () => {
  it("recognizes HubSpot CMP product tokens and enrichment provenance", () => {
    expect(
      leadIndicatesCmpSourceCohort({
        attributes: { integration: { productInterestedIn: "WD; CMP" } },
      }),
    ).toBe(true);
    expect(
      leadIndicatesCmpSourceCohort({
        intelligenceProvenance: {
          jobTitle: {
            method: "hubspot",
            source: HUBSPOT_CMP_INTELLIGENCE_SOURCE,
            appliedAt: augustCreated.toISOString(),
            notes: null,
          },
        },
      }),
    ).toBe(true);
    expect(
      leadIndicatesCmpSourceCohort({
        attributes: { integration: { productInterestedIn: "WD" } },
      }),
    ).toBe(false);
  });

  it("matches CMP projects without false positives like campanules", () => {
    expect(isCmpCrmProjectIdentity("CMP", null)).toBe(true);
    expect(isCmpCrmProjectIdentity("CMP Emailing BE", "CMP_Emailing_BE")).toBe(true);
    expect(isCmpCrmProjectIdentity("Campanules", "campanules")).toBe(false);
    expect(isCmpCrmProjectIdentity("Grosvenor Vistas", "GV")).toBe(false);
  });
});
