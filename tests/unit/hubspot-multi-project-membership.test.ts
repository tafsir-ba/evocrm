import { describe, expect, it } from "vitest";

import {
  evaluateHeldHubSpotCohortGate,
  hubspotHeldCohortMigrationInstruction,
  planHubSpotMultiProjectMemberships,
  HUBSPOT_HELD_APPLY_ENV,
  HUBSPOT_HELD_MULTI_PROJECT_COHORT_SIZE,
  HUBSPOT_MULTI_PROJECT_SIDE_EFFECT_GUARD,
} from "@/lib/hubspot-multi-project-membership";

describe("HubSpot multi-project membership planner", () => {
  it("plans earliest-primary memberships and never enables automation", () => {
    const planned = planHubSpotMultiProjectMemberships({
      currentProjectId: "later",
      hubspotContactId: "hs-1",
      fallbackNow: new Date("2026-08-30T00:00:00.000Z"),
      associations: [
        {
          projectId: "later",
          joinedAt: "2025-09-01T00:00:00.000Z",
          sourceOrder: 1,
          hubspotAssociationId: "assoc-2",
        },
        {
          projectId: "earliest",
          joinedAt: "2021-02-01T00:00:00.000Z",
          sourceOrder: 0,
          hubspotAssociationId: "assoc-1",
        },
      ],
    });

    expect(planned.ok).toBe(true);
    expect(planned.triggerAutomation).toBe(false);
    expect(HUBSPOT_MULTI_PROJECT_SIDE_EFFECT_GUARD.enrollCampaigns).toBe(false);
    expect(planned.memberships[0]?.projectId).toBe("earliest");
    expect(planned.memberships[0]?.isPrimary).toBe(true);
    expect(planned.memberships[1]?.isPrimary).toBe(false);
    expect(planned.memberships[0]?.provenance.hubspotContactId).toBe("hs-1");
    expect(planned.memberships[0]?.source).toBe("hubspot_association");
  });

  it("blocks applying the held 2,380 cohort without the explicit gate", () => {
    expect(
      evaluateHeldHubSpotCohortGate({
        apply: true,
        source: "held-exceptions",
        acknowledgeHeldCohort: "2380",
        envValue: null,
        cohortSize: HUBSPOT_HELD_MULTI_PROJECT_COHORT_SIZE,
      }).allowed,
    ).toBe(false);

    expect(
      evaluateHeldHubSpotCohortGate({
        apply: true,
        source: "held-exceptions",
        acknowledgeHeldCohort: "2380",
        envValue: "1",
        cohortSize: HUBSPOT_HELD_MULTI_PROJECT_COHORT_SIZE,
      }).allowed,
    ).toBe(true);

    expect(hubspotHeldCohortMigrationInstruction()).toContain(HUBSPOT_HELD_APPLY_ENV);
    expect(hubspotHeldCohortMigrationInstruction()).toContain("acknowledge-held-cohort=2380");
  });
});
