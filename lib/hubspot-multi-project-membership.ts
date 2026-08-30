/**
 * Planner for HubSpot contact→project associations → native memberships.
 * Does not write data, enroll campaigns, or import the held multi-project cohort.
 */

import {
  buildMembershipProvenance,
  planContactProjectMemberships,
  type LeadProjectMembershipProvenance,
  type MembershipHistoryCandidate,
  type NormalizedMembershipPlan,
} from "@/lib/lead-project-membership";

export const HUBSPOT_HELD_MULTI_PROJECT_COHORT_SIZE = 2380;
export const HUBSPOT_HELD_COHORT_ACKNOWLEDGE = "2380";
export const HUBSPOT_HELD_APPLY_ENV = "EVOHOME_APPLY_HELD_HUBSPOT_MULTI_PROJECT";

export const HUBSPOT_MULTI_PROJECT_SIDE_EFFECT_GUARD = Object.freeze({
  triggerAutomation: false,
  enrollCampaigns: false,
  enrollDrips: false,
  applyHeldCohort: false,
});

export type HubSpotAssociationHistoryItem = {
  projectId: string;
  joinedAt?: Date | string | null;
  sourceOrder?: number | null;
  hubspotProjectId?: string;
  hubspotAssociationId?: string;
};

export type PlannedHubSpotMembership = NormalizedMembershipPlan & {
  source: "hubspot_association";
  provenance: LeadProjectMembershipProvenance;
};

export function planHubSpotMultiProjectMemberships(input: {
  currentProjectId?: string | null;
  associations: HubSpotAssociationHistoryItem[];
  hubspotContactId?: string;
  fallbackNow?: Date;
}): {
  ok: boolean;
  memberships: PlannedHubSpotMembership[];
  conflicts: string[];
  triggerAutomation: false;
} {
  const fallbackNow = input.fallbackNow ?? new Date();
  const history: MembershipHistoryCandidate[] = input.associations.map(
    (item, index) => ({
      projectId: item.projectId,
      joinedAt: item.joinedAt,
      sourceOrder: item.sourceOrder ?? index,
    }),
  );

  const planned = planContactProjectMemberships({
    currentProjectId: input.currentProjectId,
    history,
    fallbackNow,
  });

  if (!planned.ok) {
    return {
      ok: false,
      memberships: [],
      conflicts: planned.conflicts,
      triggerAutomation: false,
    };
  }

  const associationByProject = new Map(
    input.associations.map((item) => [item.projectId, item]),
  );

  return {
    ok: true,
    memberships: planned.memberships.map((membership) => {
      const association = associationByProject.get(membership.projectId);
      return {
        ...membership,
        source: "hubspot_association" as const,
        provenance: buildMembershipProvenance({
          method: "hubspot_association",
          source: "hubspot_contact_project_association",
          notes: "Preserved HubSpot association order; earliest membership is primary.",
          appliedAt: fallbackNow,
          hubspotContactId: input.hubspotContactId,
          hubspotAssociationId: association?.hubspotAssociationId,
          sourceMembershipDate: membership.joinedAt,
          sourceOrder: membership.sourceOrder,
        }),
      };
    }),
    conflicts: [],
    triggerAutomation: false,
  };
}

export type HeldCohortGate = {
  allowed: boolean;
  reason: string;
};

/**
 * The held ~2,380 multi-project HubSpot contacts must not be applied yet.
 * The dedicated HubSpot task must pass both the env flag and acknowledge size.
 */
export function evaluateHeldHubSpotCohortGate(input: {
  apply?: boolean;
  source?: string;
  acknowledgeHeldCohort?: string;
  envValue?: string | null;
  cohortSize?: number;
}): HeldCohortGate {
  const isHeldSource = input.source === "held-exceptions";
  if (!isHeldSource) {
    return { allowed: true, reason: "not_held_cohort" };
  }

  if (!input.apply) {
    return {
      allowed: true,
      reason: "dry_run_held_cohort",
    };
  }

  const envOk = input.envValue === "1";
  const ackOk = input.acknowledgeHeldCohort === HUBSPOT_HELD_COHORT_ACKNOWLEDGE;
  const sizeOk =
    input.cohortSize == null ||
    input.cohortSize === HUBSPOT_HELD_MULTI_PROJECT_COHORT_SIZE;

  if (!envOk || !ackOk || !sizeOk) {
    return {
      allowed: false,
      reason: "held_multi_project_cohort_blocked",
    };
  }

  return { allowed: true, reason: "held_cohort_acknowledged" };
}

export function hubspotHeldCohortMigrationInstruction(): string {
  return [
    "Do not run this until the dedicated HubSpot multi-project import task.",
    "Native membership capability is deployed; the held cohort stays excluded.",
    "",
    "Exact command for the main HubSpot multi-project task:",
    "",
    `${HUBSPOT_HELD_APPLY_ENV}=1 \\`,
    "npm run migrate:hubspot-multi-project -- \\",
    "  --apply \\",
    "  --source=held-exceptions \\",
    `  --acknowledge-held-cohort=${HUBSPOT_HELD_COHORT_ACKNOWLEDGE}`,
    "",
    "The command must not enroll campaigns or drips. Legacy HubSpot contacts stay excluded.",
  ].join("\n");
}
