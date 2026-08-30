import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { canEnrollLeadInCampaigns, buildMigratedCampaignGuardAttributes } from "@/lib/campaign-enrollment-guard";
import {
  GV_PILOT_ABORT_THRESHOLD,
  GV_PILOT_GENERAL_PROJECT_ID,
  GV_PILOT_INBOUND_SOURCE,
  GV_PILOT_INTEGRATION_ID,
  GV_PILOT_MANIFEST_DIR,
  GV_PILOT_PORTAL_ID,
  GV_PILOT_PROJECT_ID,
  GV_PILOT_PROJECT_REFERENCE,
  GV_PILOT_SIDE_EFFECT_GUARD,
  GV_PILOT_WORKSPACE_ID,
  assertDestinationIsGv,
  assertSideEffectGuard,
  buildLiveWriteGate,
  canPersistWrites,
  existingLeadFromRecord,
  evaluateGvPilotEligibility,
  hubspotContactIdempotencyKey,
  parseExecuteArgs,
  parseGvPilotManifest,
  resolveManifestFileName,
  shouldAbortRun,
  snapshotFromHubSpotProperties,
  type GvPilotLiveWriteGate,
  type GvPilotManifest,
  type GvPilotRecordOutcome,
  type GvPilotUnexpectedReason,
  GV_PILOT_HUBSPOT_PROPERTIES,
} from "@/lib/hubspot-gv-pilot";
import { countCampaignEnrollmentsForLeadIds } from "@/server/repositories/campaign-enrollments";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import { listHubSpotProjectMappings } from "@/server/repositories/hubspot-project-mappings";
import {
  createHubSpotMigrationRun,
  findActiveExecuteRunByChecksum,
  updateHubSpotMigrationRun,
  type HubSpotMigrationRunRecordItem,
} from "@/server/repositories/hubspot-migration-runs";
import { findIntegrationById } from "@/server/repositories/integrations";
import {
  countActiveLeadsForProject,
  findLeadByIntegrationIdempotencyKey,
  findLeadsByIds,
  findLeadsForHubSpotGvPilotDedupe,
} from "@/server/repositories/leads";
import { findProjectById } from "@/server/repositories/projects";
import { fetchHubSpotContactsByIds } from "@/server/services/hubspot-client";
import { createLeadForWorkspace } from "@/server/services/leads";

export type GvPilotRunReport = {
  mode: "dry-run" | "execute";
  persisted: boolean;
  persistReason: string | null;
  runId: string | null;
  manifestName: string;
  manifestChecksum: string;
  portalId: string;
  workspaceId: string;
  destinationProjectId: string;
  destinationReference: string;
  abortThreshold: number;
  aborted: boolean;
  abortReason: string | null;
  wouldCreate: number;
  created: number;
  skipped: number;
  unexpected: number;
  cohorts: {
    new_write_eligible: number;
    email_match_readonly: number;
    excluded: number;
  };
  exclusionCounts: Record<string, number>;
  records: Array<{
    hubspotContactId: string;
    idempotencyKey: string;
    cohort: string;
    exclusions: string[];
    outcome: GvPilotRecordOutcome;
    unexpectedReason: GvPilotUnexpectedReason | null;
    leadId: string | null;
  }>;
  reconciliation: GvPilotReconciliation;
  liveWriteGate: GvPilotLiveWriteGate;
};

export type GvPilotReconciliation = {
  destinationProjectId: string;
  destinationReference: string | null;
  destinationIsGv: boolean;
  mappingCount: number;
  integrationDefaultProjectId: string | null;
  integrationAllowOverride: boolean;
  gvLeadCount: number;
  generalLeadCount: number;
  enrollmentCount: number;
  createdLeadIds: string[];
  generalProjectTouched: boolean;
  campaignGuard: {
    createdLeadsGuarded: number;
    enrollableWithoutOptIn: number;
    enrollmentCount: number;
  };
};

export function resolveGvPilotManifestPath(name: string, cwd = process.cwd()): string {
  return path.join(cwd, GV_PILOT_MANIFEST_DIR, resolveManifestFileName(name));
}

export async function loadGvPilotManifest(
  name: string,
  cwd = process.cwd(),
): Promise<GvPilotManifest> {
  const filePath = resolveGvPilotManifestPath(name, cwd);
  const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  const manifest = parseGvPilotManifest(raw);
  const expectedName = resolveManifestFileName(name).replace(/\.json$/, "");
  if (manifest.name !== expectedName) {
    throw new Error("manifest_name_mismatch");
  }
  return manifest;
}

function resolveAccessToken(explicit?: string): string {
  const token = (explicit ?? process.env.HUBSPOT_ACCESS_TOKEN ?? "").trim();
  if (!token || token.includes("*")) {
    throw new Error("hubspot_access_token_unavailable");
  }
  return token;
}

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

async function loadDestinationContext(): Promise<{
  destinationIsGv: boolean;
  destinationReference: string | null;
  mappingCount: number;
  integrationDefaultProjectId: string | null;
  integrationAllowOverride: boolean;
  actorId: string;
}> {
  const project = await findProjectById(GV_PILOT_WORKSPACE_ID, GV_PILOT_PROJECT_ID);
  if (!project || project.archivedAt) {
    throw new Error("destination_project_missing");
  }
  assertDestinationIsGv({
    projectId: project.id,
    projectReference: project.reference,
  });

  const integration = await findIntegrationById(
    GV_PILOT_WORKSPACE_ID,
    GV_PILOT_INTEGRATION_ID,
  );
  if (!integration || integration.archivedAt || integration.status !== "active") {
    throw new Error("integration_not_active");
  }
  if (integration.externalAccountId !== GV_PILOT_PORTAL_ID) {
    throw new Error("integration_portal_mismatch");
  }
  if (integration.defaultProjectId !== GV_PILOT_PROJECT_ID) {
    throw new Error("integration_default_not_gv");
  }
  if (integration.allowProjectOverride) {
    throw new Error("integration_override_enabled");
  }

  const mappings = await listHubSpotProjectMappings(
    GV_PILOT_WORKSPACE_ID,
    GV_PILOT_INTEGRATION_ID,
  );

  return {
    destinationIsGv: true,
    destinationReference: project.reference,
    mappingCount: mappings.length,
    integrationDefaultProjectId: integration.defaultProjectId,
    integrationAllowOverride: integration.allowProjectOverride,
    actorId: integration.createdBy,
  };
}

async function reconcile(input: {
  createdLeadIds: string[];
  destinationReference: string | null;
  mappingCount: number;
  integrationDefaultProjectId: string | null;
  integrationAllowOverride: boolean;
}): Promise<GvPilotReconciliation> {
  const [gvLeadCount, generalLeadCount, enrollmentCount, createdLeads] = await Promise.all([
    countActiveLeadsForProject(GV_PILOT_WORKSPACE_ID, GV_PILOT_PROJECT_ID),
    countActiveLeadsForProject(GV_PILOT_WORKSPACE_ID, GV_PILOT_GENERAL_PROJECT_ID),
    countCampaignEnrollmentsForLeadIds(GV_PILOT_WORKSPACE_ID, input.createdLeadIds),
    findLeadsByIds(GV_PILOT_WORKSPACE_ID, input.createdLeadIds),
  ]);

  const enrollableWithoutOptIn = createdLeads.filter((lead) =>
    canEnrollLeadInCampaigns(lead.attributes),
  ).length;
  const createdLeadsGuarded = createdLeads.filter(
    (lead) => !canEnrollLeadInCampaigns(lead.attributes),
  ).length;

  return {
    destinationProjectId: GV_PILOT_PROJECT_ID,
    destinationReference: input.destinationReference,
    destinationIsGv: input.destinationReference === GV_PILOT_PROJECT_REFERENCE,
    mappingCount: input.mappingCount,
    integrationDefaultProjectId: input.integrationDefaultProjectId,
    integrationAllowOverride: input.integrationAllowOverride,
    gvLeadCount,
    generalLeadCount,
    enrollmentCount,
    createdLeadIds: input.createdLeadIds,
    generalProjectTouched: false,
    campaignGuard: {
      createdLeadsGuarded,
      enrollableWithoutOptIn,
      enrollmentCount,
    },
  };
}

export async function runHubSpotGvPilot(input: {
  argv: string[];
  cwd?: string;
  accessToken?: string;
}): Promise<GvPilotRunReport> {
  assertSideEffectGuard();
  const args = parseExecuteArgs(input.argv);
  if (!args.manifestName) {
    throw new Error("manifest_required");
  }

  const persist = canPersistWrites(args);
  const persistWrites = persist.ok;
  if (!persistWrites) {
    const mongoose = await import("mongoose");
    mongoose.set("autoIndex", false);
  }
  const manifest = await loadGvPilotManifest(args.manifestName, input.cwd);
  const accessToken = resolveAccessToken(input.accessToken);
  const context = await loadDestinationContext();

  const fetched = await fetchHubSpotContactsByIds({
    accessToken,
    contactIds: manifest.hubspotContactIds,
    properties: [...GV_PILOT_HUBSPOT_PROPERTIES],
  });
  const fetchedById = new Map(fetched.filter((item) => item.id).map((item) => [item.id, item]));

  const snapshots = manifest.hubspotContactIds
    .map((id) => {
      const raw = fetchedById.get(id);
      return raw ? snapshotFromHubSpotProperties(raw.id, raw.properties) : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const existing = await findLeadsForHubSpotGvPilotDedupe({
    workspaceId: GV_PILOT_WORKSPACE_ID,
    projectId: GV_PILOT_PROJECT_ID,
    emailNormalizedValues: snapshots
      .map((snapshot) => snapshot.emailNormalized)
      .filter((email): email is string => Boolean(email)),
    hubspotContactIds: manifest.hubspotContactIds,
  });
  const existingLeads = existing.map((lead) => existingLeadFromRecord(lead));

  let runId: string | null = null;
  if (persistWrites) {
    const already = await findActiveExecuteRunByChecksum(
      GV_PILOT_WORKSPACE_ID,
      manifest.idChecksum,
    );
    if (already) {
      throw new Error("execute_run_already_exists");
    }
    const run = await createHubSpotMigrationRun({
      workspaceId: GV_PILOT_WORKSPACE_ID,
      integrationId: GV_PILOT_INTEGRATION_ID,
      portalId: GV_PILOT_PORTAL_ID,
      destinationProjectId: GV_PILOT_PROJECT_ID,
      destinationReference: GV_PILOT_PROJECT_REFERENCE,
      manifestName: manifest.name,
      manifestChecksum: manifest.idChecksum,
      hubspotContactIds: manifest.hubspotContactIds,
      mode: "execute",
      status: "running",
      abortThreshold: GV_PILOT_ABORT_THRESHOLD,
      actorId: context.actorId,
      sideEffectGuard: { ...GV_PILOT_SIDE_EFFECT_GUARD },
    });
    runId = run.id;
    await createAuditLog({
      workspaceId: GV_PILOT_WORKSPACE_ID,
      actorId: context.actorId,
      action: "hubspot_migration_run.started",
      entityType: "hubspot_migration_run",
      entityId: run.id,
      after: {
        manifestName: manifest.name,
        manifestChecksum: manifest.idChecksum,
        size: manifest.size,
      },
    });
  }

  let statusId: string | null = null;
  let sourceId: string | null = null;
  if (persistWrites) {
    const status = await findDictionaryItemByTypeAndKey(
      GV_PILOT_WORKSPACE_ID,
      "lead_status",
      "new",
    );
    const source = await findDictionaryItemByTypeAndKey(
      GV_PILOT_WORKSPACE_ID,
      "lead_source",
      "hubspot",
    );
    if (!status?.isActive) {
      throw new Error("lead_status_new_missing");
    }
    statusId = status.id;
    sourceId = source?.isActive ? source.id : null;
  }

  const records: GvPilotRunReport["records"] = [];
  const exclusionCounts: Record<string, number> = {};
  const cohorts = {
    new_write_eligible: 0,
    email_match_readonly: 0,
    excluded: 0,
  };
  const createdLeadIds: string[] = [];
  let unexpected = 0;
  let created = 0;
  let skipped = 0;
  let wouldCreate = 0;
  let aborted = false;
  let abortReason: string | null = null;

  for (const contactId of manifest.hubspotContactIds) {
    const idempotencyKey = hubspotContactIdempotencyKey(contactId);
    if (aborted && persistWrites) {
      records.push({
        hubspotContactId: contactId,
        idempotencyKey,
        cohort: "excluded",
        exclusions: [],
        outcome: "aborted_unprocessed",
        unexpectedReason: null,
        leadId: null,
      });
      continue;
    }

    const raw = fetchedById.get(contactId);
    if (!raw) {
      unexpected += 1;
      records.push({
        hubspotContactId: contactId,
        idempotencyKey,
        cohort: "excluded",
        exclusions: [],
        outcome: "unexpected",
        unexpectedReason: "hubspot_contact_missing",
        leadId: null,
      });
      if (shouldAbortRun(unexpected) && persistWrites) {
        aborted = true;
        abortReason = "hubspot_contact_missing";
      }
      continue;
    }

    const snapshot = snapshotFromHubSpotProperties(raw.id, raw.properties);
    const eligibility = evaluateGvPilotEligibility(snapshot, existingLeads);
    incrementCount(cohorts, eligibility.cohort);
    for (const reason of eligibility.exclusions) {
      incrementCount(exclusionCounts, reason);
    }

    if (!eligibility.writeEligible) {
      skipped += 1;
      records.push({
        hubspotContactId: contactId,
        idempotencyKey,
        cohort: eligibility.cohort,
        exclusions: eligibility.exclusions,
        outcome: "skipped",
        unexpectedReason: null,
        leadId: null,
      });
      continue;
    }

    if (!persistWrites) {
      wouldCreate += 1;
      records.push({
        hubspotContactId: contactId,
        idempotencyKey,
        cohort: eligibility.cohort,
        exclusions: [],
        outcome: "would_create",
        unexpectedReason: null,
        leadId: null,
      });
      continue;
    }

    const existingByKey = await findLeadByIntegrationIdempotencyKey(
      GV_PILOT_WORKSPACE_ID,
      GV_PILOT_INTEGRATION_ID,
      idempotencyKey,
    );
    if (existingByKey) {
      unexpected += 1;
      records.push({
        hubspotContactId: contactId,
        idempotencyKey,
        cohort: eligibility.cohort,
        exclusions: ["hubspot_id_match"],
        outcome: "unexpected",
        unexpectedReason: "create_duplicate_unexpected",
        leadId: existingByKey.id,
      });
      if (shouldAbortRun(unexpected)) {
        aborted = true;
        abortReason = "create_duplicate_unexpected";
      }
      continue;
    }

    try {
      const result = await createLeadForWorkspace(
        GV_PILOT_WORKSPACE_ID,
        context.actorId,
        {
          projectId: GV_PILOT_PROJECT_ID,
          statusId: statusId!,
          sourceId: sourceId ?? undefined,
          firstName: snapshot.firstName,
          lastName: snapshot.lastName,
          email: snapshot.emailNormalized ?? undefined,
          phone: snapshot.hasPhone
            ? (raw.properties.phone ?? raw.properties.mobilephone ?? undefined) ?? undefined
            : undefined,
          emailConsentStatus: "unknown",
          attributes: {
            integration: {
              integrationId: GV_PILOT_INTEGRATION_ID,
              externalId: contactId,
              idempotencyKey,
              inboundSource: GV_PILOT_INBOUND_SOURCE,
            },
            ...buildMigratedCampaignGuardAttributes(),
          },
        },
        { triggerAutomation: false },
      );

      if (result.lead.projectId === GV_PILOT_GENERAL_PROJECT_ID) {
        unexpected += 1;
        records.push({
          hubspotContactId: contactId,
          idempotencyKey,
          cohort: eligibility.cohort,
          exclusions: ["destination_not_gv"],
          outcome: "unexpected",
          unexpectedReason: "general_project_write",
          leadId: result.lead.id,
        });
        aborted = true;
        abortReason = "general_project_write";
        continue;
      }

      if (result.lead.projectId !== GV_PILOT_PROJECT_ID) {
        unexpected += 1;
        records.push({
          hubspotContactId: contactId,
          idempotencyKey,
          cohort: eligibility.cohort,
          exclusions: ["destination_not_gv"],
          outcome: "unexpected",
          unexpectedReason: "lead_project_mismatch",
          leadId: result.lead.id,
        });
        if (shouldAbortRun(unexpected)) {
          aborted = true;
          abortReason = "lead_project_mismatch";
        }
        continue;
      }

      created += 1;
      createdLeadIds.push(result.lead.id);
      records.push({
        hubspotContactId: contactId,
        idempotencyKey,
        cohort: eligibility.cohort,
        exclusions: [],
        outcome: "created",
        unexpectedReason: null,
        leadId: result.lead.id,
      });
    } catch (error) {
      const duplicate = error instanceof AppError && error.code === "CONFLICT";
      unexpected += 1;
      records.push({
        hubspotContactId: contactId,
        idempotencyKey,
        cohort: eligibility.cohort,
        exclusions: [],
        outcome: "unexpected",
        unexpectedReason: duplicate ? "create_duplicate_unexpected" : "create_failed",
        leadId: null,
      });
      if (shouldAbortRun(unexpected)) {
        aborted = true;
        abortReason = duplicate ? "create_duplicate_unexpected" : "create_failed";
      }
    }
  }

  const reconciliation = await reconcile({
    createdLeadIds,
    destinationReference: context.destinationReference,
    mappingCount: context.mappingCount,
    integrationDefaultProjectId: context.integrationDefaultProjectId,
    integrationAllowOverride: context.integrationAllowOverride,
  });

  if (persistWrites) {
    if (reconciliation.enrollmentCount > 0) {
      unexpected += 1;
      aborted = true;
      abortReason = abortReason ?? "automation_side_effect";
    }
    if (reconciliation.campaignGuard.enrollableWithoutOptIn > 0) {
      unexpected += 1;
      aborted = true;
      abortReason = abortReason ?? "campaign_guard_missing";
    }
  }

  if (persistWrites && runId) {
    const persistedRecords: HubSpotMigrationRunRecordItem[] = records.map((record) => ({
      ...record,
      destinationProjectId: record.leadId ? GV_PILOT_PROJECT_ID : null,
    }));
    await updateHubSpotMigrationRun(runId, {
      status: aborted ? "aborted" : "completed",
      unexpectedCount: unexpected,
      createdCount: created,
      skippedCount: skipped,
      wouldCreateCount: wouldCreate,
      aborted,
      abortReason,
      records: persistedRecords,
      reconciliation,
      completedAt: new Date(),
    });
    await createAuditLog({
      workspaceId: GV_PILOT_WORKSPACE_ID,
      actorId: context.actorId,
      action: aborted ? "hubspot_migration_run.aborted" : "hubspot_migration_run.completed",
      entityType: "hubspot_migration_run",
      entityId: runId,
      after: {
        created,
        unexpected,
        aborted,
        abortReason,
      },
    });
  }

  const mode = persistWrites ? "execute" : "dry-run";
  const liveWriteGate = buildLiveWriteGate({
    persisted: persistWrites,
    mode,
    manifestValid: true,
    size: manifest.hubspotContactIds.length,
    wouldCreate,
    unexpected,
    emailMatchReadonly: cohorts.email_match_readonly,
    excluded: cohorts.excluded,
    destinationIsGv: reconciliation.destinationIsGv,
    mappingCount: reconciliation.mappingCount,
    integrationDefaultProjectId: reconciliation.integrationDefaultProjectId,
    integrationAllowOverride: reconciliation.integrationAllowOverride,
    enrollmentCount: reconciliation.enrollmentCount,
    generalProjectTouched: reconciliation.generalProjectTouched,
  });

  return {
    mode,
    persisted: persistWrites,
    persistReason: persist.ok ? null : persist.reason,
    runId,
    manifestName: manifest.name,
    manifestChecksum: manifest.idChecksum,
    portalId: GV_PILOT_PORTAL_ID,
    workspaceId: GV_PILOT_WORKSPACE_ID,
    destinationProjectId: GV_PILOT_PROJECT_ID,
    destinationReference: GV_PILOT_PROJECT_REFERENCE,
    abortThreshold: GV_PILOT_ABORT_THRESHOLD,
    aborted,
    abortReason,
    wouldCreate,
    created,
    skipped,
    unexpected,
    cohorts,
    exclusionCounts,
    records,
    reconciliation,
    liveWriteGate,
  };
}
