/**
 * Capability runner for HubSpot multi-project associations.
 * Does not enroll campaigns/drips. The held ~2,380 cohort is blocked
 * unless the dedicated HubSpot task supplies the explicit gate.
 *
 * Usage:
 *   npm run migrate:hubspot-multi-project -- --dry-run --plan-file=path.json
 *   npm run migrate:hubspot-multi-project -- --source=held-exceptions
 *
 * Held-cohort apply (DO NOT RUN in this change):
 *   EVOHOME_APPLY_HELD_HUBSPOT_MULTI_PROJECT=1 \
 *   npm run migrate:hubspot-multi-project -- \
 *     --apply --source=held-exceptions --acknowledge-held-cohort=2380
 */
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";

import {
  evaluateHeldHubSpotCohortGate,
  hubspotHeldCohortMigrationInstruction,
  planHubSpotMultiProjectMemberships,
  HUBSPOT_HELD_APPLY_ENV,
  HUBSPOT_HELD_MULTI_PROJECT_COHORT_SIZE,
} from "../lib/hubspot-multi-project-membership";
import { applyPlannedMembershipsToLead } from "../server/services/lead-project-memberships";

type PlanFile = {
  workspaceId: string;
  actorId: string;
  leads: Array<{
    leadId: string;
    currentProjectId?: string | null;
    hubspotContactId?: string;
    associations: Array<{
      projectId: string;
      joinedAt?: string;
      sourceOrder?: number;
    }>;
  }>;
};

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() || undefined : undefined;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const source = readArg("source") ?? "plan-file";
  const acknowledgeHeldCohort = readArg("acknowledge-held-cohort");
  const gate = evaluateHeldHubSpotCohortGate({
    apply,
    source,
    acknowledgeHeldCohort,
    envValue: process.env[HUBSPOT_HELD_APPLY_ENV],
    cohortSize: HUBSPOT_HELD_MULTI_PROJECT_COHORT_SIZE,
  });

  if (source === "held-exceptions") {
    console.log(hubspotHeldCohortMigrationInstruction());
    if (!gate.allowed) {
      throw new Error(gate.reason);
    }
    if (!apply) {
      console.log("[migrate:hubspot-multi-project] held cohort dry-run only; no writes.");
      return;
    }
    throw new Error(
      "Held cohort apply is reserved for the dedicated HubSpot multi-project task.",
    );
  }

  const planFile = readArg("plan-file");
  if (!planFile) {
    throw new Error("Provide --plan-file=... or --source=held-exceptions.");
  }

  const parsed = JSON.parse(await readFile(planFile, "utf8")) as PlanFile;
  let applied = 0;
  for (const lead of parsed.leads) {
    const planned = planHubSpotMultiProjectMemberships({
      currentProjectId: lead.currentProjectId,
      associations: lead.associations,
      hubspotContactId: lead.hubspotContactId,
    });
    if (!planned.ok) {
      throw new Error(`Plan conflict for lead ${lead.leadId}: ${planned.conflicts.join(",")}`);
    }
    if (!apply) {
      continue;
    }
    await applyPlannedMembershipsToLead({
      workspaceId: parsed.workspaceId,
      leadId: lead.leadId,
      actorId: parsed.actorId,
      plans: planned.memberships,
    });
    applied += 1;
  }

  console.log("[migrate:hubspot-multi-project] complete", {
    apply,
    plannedLeads: parsed.leads.length,
    applied,
    triggerAutomation: false,
  });
}

main()
  .then(async () => {
    await mongoose.disconnect().catch(() => undefined);
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error("[migrate:hubspot-multi-project] failed", error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
