import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  buildMigratedCampaignGuardAttributes,
  isBlockedFromAutomaticCampaignEnrollment,
} from "@/lib/campaign-enrollment-guard";
import {
  canPersistWrites,
  existingLeadFromRecord,
  hubspotContactIdempotencyKey,
  buildMigrationNameAttributes,
  resolveMigrationLeadIdentity,
  snapshotFromHubSpotProperties,
  type GvPilotRecordOutcome,
  type GvPilotUnexpectedReason,
} from "@/lib/hubspot-gv-pilot";
import {
  WD_MIGRATION_ABORT_THRESHOLD,
  WD_MIGRATION_GENERAL_PROJECT_ID,
  WD_MIGRATION_GV_PROJECT_ID,
  WD_MIGRATION_HUBSPOT_PROPERTIES,
  WD_MIGRATION_INBOUND_SOURCE,
  WD_MIGRATION_INTEGRATION_ID,
  WD_MIGRATION_MANIFEST_DIR,
  WD_MIGRATION_PORTAL_ID,
  WD_MIGRATION_SIDE_EFFECT_GUARD,
  WD_MIGRATION_WORKSPACE_ID,
  assertExplicitMappedDestination,
  assertSideEffectGuard,
  buildWdMigrationLiveWriteGate,
  evaluateWdProjectEligibility,
  parseExecuteArgs,
  parseWdProjectManifest,
  resolveManifestFileName,
  type WdMigrationLiveWriteGate,
  type WdProjectMigrationManifest,
} from "@/lib/hubspot-wd-project-migration";
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
  findActiveLeadByEmailNormalized,
  findLeadByIntegrationIdempotencyKey,
  findLeadsByIds,
  findLeadsForHubSpotGvPilotDedupe,
} from "@/server/repositories/leads";
import { findProjectById } from "@/server/repositories/projects";
import { fetchHubSpotContactsByIds } from "@/server/services/hubspot-client";
import { createLeadForWorkspace } from "@/server/services/leads";

export type WdProjectRunReport = {
  mode: "dry-run" | "execute";
  persisted: boolean;
  persistReason: string | null;
  runId: string | null;
  manifestName: string;
  manifestChecksum: string;
  portalId: string;
  workspaceId: string;
  slug: string;
  sourceHubSpotProjectId: string;
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
  reconciliation: WdProjectReconciliation;
  liveWriteGate: WdMigrationLiveWriteGate;
};

export type WdProjectReconciliation = {
  destinationProjectId: string;
  destinationReference: string | null;
  destinationIsGv: boolean;
  destinationIsGeneral: boolean;
  destinationIsMapped: boolean;
  mappingOk: boolean;
  mappingCount: number;
  integrationDefaultProjectId: string | null;
  integrationAllowOverride: boolean;
  destinationLeadCount: number;
  generalLeadCount: number;
  gvLeadCount: number;
  enrollmentCount: number;
  createdLeadIds: string[];
  generalProjectTouched: boolean;
  campaignGuard: {
    createdLeadsGuarded: number;
    automaticallyEnrollable: number;
    enrollmentCount: number;
  };
};

export function resolveWdProjectManifestPath(name: string, cwd = process.cwd()): string {
  return path.join(cwd, WD_MIGRATION_MANIFEST_DIR, resolveManifestFileName(name));
}

export async function loadWdProjectManifest(
  name: string,
  cwd = process.cwd(),
): Promise<WdProjectMigrationManifest> {
  const filePath = resolveWdProjectManifestPath(name, cwd);
  const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  const manifest = parseWdProjectManifest(raw);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchContactsWithRetry(input: {
  accessToken: string;
  contactIds: string[];
}): Promise<Array<{ id: string; properties: Record<string, string | null> }>> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await fetchHubSpotContactsByIds({
        accessToken: input.accessToken,
        contactIds: input.contactIds,
        properties: [...WD_MIGRATION_HUBSPOT_PROPERTIES],
      });
    } catch (error) {
      lastError = error;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("hubspot_batch_read_failed");
}

async function loadDestinationContext(manifest: WdProjectMigrationManifest): Promise<{
  destinationReference: string | null;
  mappingCount: number;
  mappingOk: boolean;
  integrationDefaultProjectId: string | null;
  integrationAllowOverride: boolean;
  actorId: string;
}> {
  const project = await findProjectById(WD_MIGRATION_WORKSPACE_ID, manifest.destinationProjectId);
  if (!project || project.archivedAt) {
    throw new Error("destination_project_missing");
  }
  if (project.reference !== manifest.destinationReference) {
    throw new Error("destination_reference_mismatch");
  }

  const integration = await findIntegrationById(
    WD_MIGRATION_WORKSPACE_ID,
    WD_MIGRATION_INTEGRATION_ID,
  );
  if (!integration || integration.archivedAt || integration.status !== "active") {
    throw new Error("integration_not_active");
  }
  if (integration.externalAccountId !== WD_MIGRATION_PORTAL_ID) {
    throw new Error("integration_portal_mismatch");
  }
  if (integration.allowProjectOverride) {
    throw new Error("integration_override_enabled");
  }

  const mappings = await listHubSpotProjectMappings(
    WD_MIGRATION_WORKSPACE_ID,
    WD_MIGRATION_INTEGRATION_ID,
  );
  const mapping = mappings.find((row) => row.hubspotProjectId === manifest.slug) ?? null;

  assertExplicitMappedDestination({
    slug: manifest.slug,
    destinationProjectId: manifest.destinationProjectId,
    destinationReference: manifest.destinationReference,
    mapping: mapping
      ? {
          hubspotProjectId: mapping.hubspotProjectId,
          status: mapping.status,
          evoProjectId: mapping.evoProjectId,
        }
      : null,
  });

  return {
    destinationReference: project.reference,
    mappingCount: mappings.length,
    mappingOk: true,
    integrationDefaultProjectId: integration.defaultProjectId,
    integrationAllowOverride: integration.allowProjectOverride,
    actorId: integration.createdBy,
  };
}

async function reconcile(input: {
  createdLeadIds: string[];
  destinationProjectId: string;
  destinationReference: string | null;
  mappingCount: number;
  mappingOk: boolean;
  integrationDefaultProjectId: string | null;
  integrationAllowOverride: boolean;
}): Promise<WdProjectReconciliation> {
  const [destinationLeadCount, generalLeadCount, gvLeadCount, enrollmentCount, createdLeads] =
    await Promise.all([
      countActiveLeadsForProject(WD_MIGRATION_WORKSPACE_ID, input.destinationProjectId),
      countActiveLeadsForProject(WD_MIGRATION_WORKSPACE_ID, WD_MIGRATION_GENERAL_PROJECT_ID),
      countActiveLeadsForProject(WD_MIGRATION_WORKSPACE_ID, WD_MIGRATION_GV_PROJECT_ID),
      countCampaignEnrollmentsForLeadIds(WD_MIGRATION_WORKSPACE_ID, input.createdLeadIds),
      findLeadsByIds(WD_MIGRATION_WORKSPACE_ID, input.createdLeadIds),
    ]);

  const destinationIsGv = input.destinationProjectId === WD_MIGRATION_GV_PROJECT_ID;
  const destinationIsGeneral = input.destinationProjectId === WD_MIGRATION_GENERAL_PROJECT_ID;
  const createdLeadsGuarded = createdLeads.filter((lead) =>
    isBlockedFromAutomaticCampaignEnrollment(lead.attributes),
  ).length;
  const automaticallyEnrollable = createdLeads.filter(
    (lead) => !isBlockedFromAutomaticCampaignEnrollment(lead.attributes),
  ).length;
  const generalProjectTouched = createdLeads.some(
    (lead) => lead.projectId === WD_MIGRATION_GENERAL_PROJECT_ID,
  );

  return {
    destinationProjectId: input.destinationProjectId,
    destinationReference: input.destinationReference,
    destinationIsGv,
    destinationIsGeneral,
    destinationIsMapped: input.mappingOk && !destinationIsGv && !destinationIsGeneral,
    mappingOk: input.mappingOk,
    mappingCount: input.mappingCount,
    integrationDefaultProjectId: input.integrationDefaultProjectId,
    integrationAllowOverride: input.integrationAllowOverride,
    destinationLeadCount,
    generalLeadCount,
    gvLeadCount,
    enrollmentCount,
    createdLeadIds: input.createdLeadIds,
    generalProjectTouched,
    campaignGuard: {
      createdLeadsGuarded,
      automaticallyEnrollable,
      enrollmentCount,
    },
  };
}

export async function runHubSpotWdProjectMigration(input: {
  argv: string[];
  cwd?: string;
  accessToken?: string;
}): Promise<WdProjectRunReport> {
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
  const manifest = await loadWdProjectManifest(args.manifestName, input.cwd);
  const accessToken = resolveAccessToken(input.accessToken);
  const context = await loadDestinationContext(manifest);

  const fetched = await fetchContactsWithRetry({
    accessToken,
    contactIds: manifest.hubspotContactIds,
  });
  const fetchedById = new Map(fetched.filter((item) => item.id).map((item) => [item.id, item]));

  const snapshots = manifest.hubspotContactIds
    .map((id) => {
      const raw = fetchedById.get(id);
      return raw ? snapshotFromHubSpotProperties(raw.id, raw.properties) : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const existing = await findLeadsForHubSpotGvPilotDedupe({
    workspaceId: WD_MIGRATION_WORKSPACE_ID,
    projectId: manifest.destinationProjectId,
    emailNormalizedValues: snapshots
      .map((snapshot) => snapshot.emailNormalized)
      .filter((email): email is string => Boolean(email)),
    hubspotContactIds: manifest.hubspotContactIds,
  });
  const existingLeads = existing.map((lead) => existingLeadFromRecord(lead));

  let runId: string | null = null;
  if (persistWrites) {
    const already = await findActiveExecuteRunByChecksum(
      WD_MIGRATION_WORKSPACE_ID,
      manifest.idChecksum,
    );
    if (already?.status === "completed") {
      throw new Error("execute_run_already_exists");
    }
    if (already?.status === "running") {
      runId = already.id;
    } else {
      const run = await createHubSpotMigrationRun({
        workspaceId: WD_MIGRATION_WORKSPACE_ID,
        integrationId: WD_MIGRATION_INTEGRATION_ID,
        portalId: WD_MIGRATION_PORTAL_ID,
        destinationProjectId: manifest.destinationProjectId,
        destinationReference: manifest.destinationReference,
        manifestName: manifest.name,
        manifestChecksum: manifest.idChecksum,
        hubspotContactIds: manifest.hubspotContactIds,
        mode: "execute",
        status: "running",
        abortThreshold: WD_MIGRATION_ABORT_THRESHOLD,
        actorId: context.actorId,
        sideEffectGuard: { ...WD_MIGRATION_SIDE_EFFECT_GUARD },
      });
      runId = run.id;
      await createAuditLog({
        workspaceId: WD_MIGRATION_WORKSPACE_ID,
        actorId: context.actorId,
        action: "hubspot_migration_run.started",
        entityType: "hubspot_migration_run",
        entityId: run.id,
        after: {
          manifestName: manifest.name,
          manifestChecksum: manifest.idChecksum,
          size: manifest.size,
          slug: manifest.slug,
          destinationProjectId: manifest.destinationProjectId,
        },
      });
    }
  }

  let statusId: string | null = null;
  let sourceId: string | null = null;
  if (persistWrites) {
    const status = await findDictionaryItemByTypeAndKey(
      WD_MIGRATION_WORKSPACE_ID,
      "lead_status",
      "new",
    );
    const source = await findDictionaryItemByTypeAndKey(
      WD_MIGRATION_WORKSPACE_ID,
      "lead_source",
      "hubspot",
    );
    if (!status?.isActive) {
      throw new Error("lead_status_new_missing");
    }
    statusId = status.id;
    sourceId = source?.isActive ? source.id : null;
  }

  const records: WdProjectRunReport["records"] = [];
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
      if (persistWrites) {
        aborted = true;
        abortReason = "hubspot_contact_missing";
      }
      continue;
    }

    const snapshot = snapshotFromHubSpotProperties(raw.id, raw.properties);
    const eligibility = evaluateWdProjectEligibility(snapshot, existingLeads, manifest.slug);
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
      WD_MIGRATION_WORKSPACE_ID,
      WD_MIGRATION_INTEGRATION_ID,
      idempotencyKey,
    );
    if (existingByKey) {
      if (existingByKey.projectId === manifest.destinationProjectId) {
        skipped += 1;
        records.push({
          hubspotContactId: contactId,
          idempotencyKey,
          cohort: eligibility.cohort,
          exclusions: ["hubspot_id_match"],
          outcome: "skipped",
          unexpectedReason: null,
          leadId: existingByKey.id,
        });
        continue;
      }
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
      aborted = true;
      abortReason =
        existingByKey.projectId === WD_MIGRATION_GV_PROJECT_ID ||
        existingByKey.projectId === WD_MIGRATION_GENERAL_PROJECT_ID
          ? "wrong_destination"
          : "idempotency_breach";
      continue;
    }

    try {
      const identity = resolveMigrationLeadIdentity(snapshot);
      const result = await createLeadForWorkspace(
        WD_MIGRATION_WORKSPACE_ID,
        context.actorId,
        {
          projectId: manifest.destinationProjectId,
          statusId: statusId!,
          sourceId: sourceId ?? undefined,
          firstName: identity.firstName,
          lastName: identity.lastName,
          email: snapshot.emailNormalized ?? undefined,
          phone: snapshot.hasPhone
            ? (raw.properties.phone ?? raw.properties.mobilephone ?? undefined) ?? undefined
            : undefined,
          emailConsentStatus: "unknown",
          attributes: {
            integration: {
              integrationId: WD_MIGRATION_INTEGRATION_ID,
              externalId: contactId,
              idempotencyKey,
              inboundSource: WD_MIGRATION_INBOUND_SOURCE,
            },
            ...buildMigratedCampaignGuardAttributes(),
            ...buildMigrationNameAttributes(identity),
          },
        },
        {
          triggerAutomation: false,
          displayFullName: identity.displayLabel ?? undefined,
        },
      );

      if (result.lead.projectId === WD_MIGRATION_GENERAL_PROJECT_ID) {
        unexpected += 1;
        records.push({
          hubspotContactId: contactId,
          idempotencyKey,
          cohort: eligibility.cohort,
          exclusions: ["destination_forbidden"],
          outcome: "unexpected",
          unexpectedReason: "general_project_write",
          leadId: result.lead.id,
        });
        aborted = true;
        abortReason = "general_project_write";
        continue;
      }

      if (result.lead.projectId === WD_MIGRATION_GV_PROJECT_ID) {
        unexpected += 1;
        records.push({
          hubspotContactId: contactId,
          idempotencyKey,
          cohort: eligibility.cohort,
          exclusions: ["destination_forbidden"],
          outcome: "unexpected",
          unexpectedReason: "lead_project_mismatch",
          leadId: result.lead.id,
        });
        aborted = true;
        abortReason = "grosvenor_fallback_write";
        continue;
      }

      if (result.lead.projectId !== manifest.destinationProjectId) {
        unexpected += 1;
        records.push({
          hubspotContactId: contactId,
          idempotencyKey,
          cohort: eligibility.cohort,
          exclusions: ["destination_forbidden"],
          outcome: "unexpected",
          unexpectedReason: "lead_project_mismatch",
          leadId: result.lead.id,
        });
        aborted = true;
        abortReason = "lead_project_mismatch";
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
      if (duplicate) {
        // Recoverable races: lead may already exist with this HubSpot key (or email) on
        // the intended destination. Mirror hubspot-lead-capture duplicate handling.
        const byKey = await findLeadByIntegrationIdempotencyKey(
          WD_MIGRATION_WORKSPACE_ID,
          WD_MIGRATION_INTEGRATION_ID,
          idempotencyKey,
        );
        if (byKey && byKey.projectId === manifest.destinationProjectId) {
          skipped += 1;
          records.push({
            hubspotContactId: contactId,
            idempotencyKey,
            cohort: eligibility.cohort,
            exclusions: ["hubspot_id_match"],
            outcome: "skipped",
            unexpectedReason: null,
            leadId: byKey.id,
          });
          continue;
        }
        if (
          byKey &&
          (byKey.projectId === WD_MIGRATION_GV_PROJECT_ID ||
            byKey.projectId === WD_MIGRATION_GENERAL_PROJECT_ID)
        ) {
          unexpected += 1;
          records.push({
            hubspotContactId: contactId,
            idempotencyKey,
            cohort: eligibility.cohort,
            exclusions: ["hubspot_id_match"],
            outcome: "unexpected",
            unexpectedReason: "create_duplicate_unexpected",
            leadId: byKey.id,
          });
          aborted = true;
          abortReason = "wrong_destination";
          continue;
        }
        if (byKey) {
          unexpected += 1;
          records.push({
            hubspotContactId: contactId,
            idempotencyKey,
            cohort: eligibility.cohort,
            exclusions: ["hubspot_id_match"],
            outcome: "unexpected",
            unexpectedReason: "create_duplicate_unexpected",
            leadId: byKey.id,
          });
          aborted = true;
          abortReason = "idempotency_breach";
          continue;
        }
        if (snapshot.emailNormalized) {
          const byEmail = await findActiveLeadByEmailNormalized(
            WD_MIGRATION_WORKSPACE_ID,
            snapshot.emailNormalized,
            undefined,
            manifest.destinationProjectId,
          );
          const byEmailKey =
            (byEmail?.attributes as { integration?: { idempotencyKey?: string } } | undefined)
              ?.integration?.idempotencyKey ?? null;
          if (byEmail && byEmailKey === idempotencyKey) {
            skipped += 1;
            records.push({
              hubspotContactId: contactId,
              idempotencyKey,
              cohort: eligibility.cohort,
              exclusions: ["hubspot_id_match"],
              outcome: "skipped",
              unexpectedReason: null,
              leadId: byEmail.id,
            });
            continue;
          }
        }
      }
      unexpected += 1;
      const failDetail =
        error instanceof AppError
          ? `${error.code}:${error.message}`
          : error instanceof Error
            ? error.message
            : "unknown";
      records.push({
        hubspotContactId: contactId,
        idempotencyKey,
        cohort: eligibility.cohort,
        exclusions: [],
        outcome: "unexpected",
        unexpectedReason: duplicate ? "create_duplicate_unexpected" : "create_failed",
        leadId: null,
      });
      aborted = true;
      abortReason = duplicate ? "create_duplicate_unexpected" : `create_failed:${failDetail.slice(0, 120)}`;
    }
  }

  const reconciliation = await reconcile({
    createdLeadIds,
    destinationProjectId: manifest.destinationProjectId,
    destinationReference: context.destinationReference,
    mappingCount: context.mappingCount,
    mappingOk: context.mappingOk,
    integrationDefaultProjectId: context.integrationDefaultProjectId,
    integrationAllowOverride: context.integrationAllowOverride,
  });

  if (persistWrites) {
    if (reconciliation.enrollmentCount > 0) {
      unexpected += 1;
      aborted = true;
      abortReason = abortReason ?? "automation_side_effect";
    }
    if (reconciliation.campaignGuard.automaticallyEnrollable > 0) {
      unexpected += 1;
      aborted = true;
      abortReason = abortReason ?? "campaign_guard_missing";
    }
    if (reconciliation.destinationIsGv || reconciliation.destinationIsGeneral) {
      unexpected += 1;
      aborted = true;
      abortReason = abortReason ?? "destination_forbidden";
    }
  }

  if (persistWrites && runId) {
    const persistedRecords: HubSpotMigrationRunRecordItem[] = records.map((record) => ({
      ...record,
      destinationProjectId: record.leadId ? manifest.destinationProjectId : null,
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
      workspaceId: WD_MIGRATION_WORKSPACE_ID,
      actorId: context.actorId,
      action: aborted ? "hubspot_migration_run.aborted" : "hubspot_migration_run.completed",
      entityType: "hubspot_migration_run",
      entityId: runId,
      after: {
        created,
        unexpected,
        aborted,
        abortReason,
        slug: manifest.slug,
        destinationProjectId: manifest.destinationProjectId,
      },
    });
  }

  const mode = persistWrites ? "execute" : "dry-run";
  const liveWriteGate = buildWdMigrationLiveWriteGate({
    persisted: persistWrites,
    mode,
    manifestValid: true,
    size: manifest.hubspotContactIds.length,
    wouldCreate,
    unexpected,
    emailMatchReadonly: cohorts.email_match_readonly,
    excluded: cohorts.excluded,
    destinationIsMapped: reconciliation.destinationIsMapped,
    destinationIsGv: reconciliation.destinationIsGv,
    destinationIsGeneral: reconciliation.destinationIsGeneral,
    mappingOk: reconciliation.mappingOk,
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
    portalId: WD_MIGRATION_PORTAL_ID,
    workspaceId: WD_MIGRATION_WORKSPACE_ID,
    slug: manifest.slug,
    sourceHubSpotProjectId: manifest.sourceHubSpotProjectId,
    destinationProjectId: manifest.destinationProjectId,
    destinationReference: manifest.destinationReference,
    abortThreshold: WD_MIGRATION_ABORT_THRESHOLD,
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
