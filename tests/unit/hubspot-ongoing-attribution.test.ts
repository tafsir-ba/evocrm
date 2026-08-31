import { describe, expect, it } from "vitest";

import {
  isForbiddenEvoHomeDestination,
  planHubSpotOngoingAttribution,
  shouldPreserveManualMemberships,
} from "@/lib/hubspot-ongoing-attribution";
import { WD_MIGRATION_GENERAL_PROJECT_ID } from "@/lib/hubspot-wd-project-migration";

const mappings = [
  {
    hubspotProjectId: "leparcdescrets",
    status: "mapped",
    evoProjectId: "proj-lpd",
    evoProjectName: "Le Parc des Crêts",
    evoProjectReference: "LPD",
  },
  {
    hubspotProjectId: "arbora",
    status: "mapped",
    evoProjectId: "proj-arbora",
    evoProjectName: "Arbora",
    evoProjectReference: "ARB",
  },
  {
    hubspotProjectId: "cmp",
    status: "mapped",
    evoProjectId: "proj-cmp",
    evoProjectName: "CMP",
    evoProjectReference: "CMP",
  },
  {
    hubspotProjectId: "general",
    status: "mapped",
    evoProjectId: WD_MIGRATION_GENERAL_PROJECT_ID,
    evoProjectName: "EvoHome General",
    evoProjectReference: "EVO-GENERAL",
  },
  {
    hubspotProjectId: "skipped-slug",
    status: "skipped",
    evoProjectId: null,
  },
];

describe("ongoing HubSpot project attribution", () => {
  it("uses wd_project as the authoritative mapped destination", () => {
    const plan = planHubSpotOngoingAttribution({
      wdProjectValue: "leparcdescrets",
      productInterestedIn: "CMP",
      mappings,
    });
    expect(plan).toMatchObject({
      ok: true,
      parked: false,
      source: "wd_project",
      primaryProjectId: "proj-lpd",
      projectIds: ["proj-lpd"],
      triggerAutomation: false,
    });
  });

  it("applies ordered multi-project memberships with first listed as primary", () => {
    const plan = planHubSpotOngoingAttribution({
      wdProjectValue: "leparcdescrets; arbora",
      mappings,
      hubspotContactId: "99",
      fallbackNow: new Date("2026-08-31T00:00:00.000Z"),
    });
    expect(plan.ok).toBe(true);
    expect(plan.reason).toBe("multi_project");
    expect(plan.projectIds).toEqual(["proj-lpd", "proj-arbora"]);
    expect(plan.primaryProjectId).toBe("proj-lpd");
    expect(plan.memberships[0]).toMatchObject({
      projectId: "proj-lpd",
      isPrimary: true,
      sourceOrder: 0,
    });
    expect(plan.memberships[1]).toMatchObject({
      projectId: "proj-arbora",
      isPrimary: false,
      sourceOrder: 1,
    });
  });

  it("parks conflicts and unmapped tokens instead of guessing", () => {
    expect(
      planHubSpotOngoingAttribution({
        wdProjectValue: "leparcdescrets; unknown-slug",
        mappings,
      }),
    ).toMatchObject({
      ok: false,
      parked: true,
      reason: "unmapped_project",
      primaryProjectId: null,
    });

    expect(
      planHubSpotOngoingAttribution({
        wdProjectValue: "skipped-slug",
        mappings,
      }).parked,
    ).toBe(true);

    expect(
      planHubSpotOngoingAttribution({
        productInterestedIn: "WD",
        mappings,
      }),
    ).toMatchObject({ ok: false, reason: "no_project_signal", parked: true });
  });

  it("never routes ambiguity to EvoHome General", () => {
    expect(
      isForbiddenEvoHomeDestination({
        evoProjectId: WD_MIGRATION_GENERAL_PROJECT_ID,
        evoProjectReference: "EVO-GENERAL",
        evoProjectName: "EvoHome General",
      }),
    ).toBe(true);

    expect(
      planHubSpotOngoingAttribution({
        wdProjectValue: "general",
        mappings,
      }),
    ).toMatchObject({
      ok: false,
      parked: true,
      reason: "destination_forbidden",
    });
  });

  it("falls back to validated Product interested in / established mapping", () => {
    const cmp = planHubSpotOngoingAttribution({
      productInterestedIn: "CMP",
      mappings,
    });
    expect(cmp).toMatchObject({
      ok: true,
      source: "product_mapping",
      primaryProjectId: "proj-cmp",
    });

    const established = planHubSpotOngoingAttribution({
      productInterestedIn: "arbora",
      mappings,
    });
    expect(established).toMatchObject({
      ok: true,
      source: "established_mapping",
      primaryProjectId: "proj-arbora",
    });
  });

  it("does not overwrite manual memberships", () => {
    expect(shouldPreserveManualMemberships(["hubspot_association", "lead_create"])).toBe(false);
    expect(shouldPreserveManualMemberships(["manual"])).toBe(true);
  });
});
