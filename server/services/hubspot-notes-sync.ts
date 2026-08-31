import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  assertHubSpotNotesSideEffectGuard,
  classifyHubSpotTimelineItem,
  evaluateHubSpotNotesDryRun,
  evaluateHubSpotNotesMutationGate,
  hubspotContactIdFromLeadAttributes,
  hubspotNoteEventKey,
  hubspotNoteIdempotencyKey,
  planHubSpotNoteActivity,
  resolveHubSpotNotesLeadMatch,
  HUBSPOT_NOTES_SYNC_INTELLIGENCE_SOURCE,
  HUBSPOT_NOTES_SYNC_SIDE_EFFECT_GUARD,
} from "@/lib/hubspot-notes-sync";
import { nextHubSpotSyncEventStatus } from "@/lib/hubspot-ongoing-sync";
import {
  createActivity,
  findActivityByHubSpotExternalId,
} from "@/server/repositories/activities";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import {
  findLeadByHubSpotContactId,
  findLeadsWithHubSpotContactIdempotency,
  listActiveLeadsByNormalizedEmail,
  type LeadRecord,
} from "@/server/repositories/leads";
import {
  claimHubSpotSyncEvent,
  updateHubSpotSyncEvent,
} from "@/server/repositories/hubspot-sync-events";
import {
  ensureHubSpotSyncCursor,
  findHubSpotSyncCursor,
  updateHubSpotSyncCursor,
  type HubSpotSyncCursorRecord,
} from "@/server/repositories/hubspot-sync-cursors";
import { findIntegrations, type IntegrationRecord } from "@/server/repositories/integrations";
import { ensureDefaultDictionaries } from "@/server/services/default-dictionaries";
import {
  assertHubSpotAccessToken,
  fetchHubSpotContact,
  fetchHubSpotNoteContactIds,
  listHubSpotContactTimelineItems,
  searchHubSpotNoteObjectsModifiedSince,
} from "@/server/services/hubspot-client";
import { normalizeLeadEmail } from "@/server/services/leads";
import { writeIntegrationLog } from "@/server/services/integration-logs";
import { decodeHubSpotCredentials } from "@/server/security/integration-credentials";

assertHubSpotNotesSideEffectGuard();

export type HubSpotNotesSyncSummary = {
  received: number;
  created: number;
  duplicates: number;
  skipped: number;
  parked: number;
  failed: number;
  excluded: number;
  wouldCreate: number;
  contactsScanned: number;
  searched: boolean;
};

function emptySummary(): HubSpotNotesSyncSummary {
  return {
    received: 0,
    created: 0,
    duplicates: 0,
    skipped: 0,
    parked: 0,
    failed: 0,
    excluded: 0,
    wouldCreate: 0,
    contactsScanned: 0,
    searched: false,
  };
}

function notesGate(path: "incremental" | "backfill" | "dry-run", cursor: HubSpotSyncCursorRecord | null) {
  return evaluateHubSpotNotesMutationGate({
    releaseGate: process.env.HUBSPOT_NOTES_SYNC_RELEASE_GATE,
    incrementalEnabled: process.env.HUBSPOT_NOTES_SYNC_INCREMENTAL,
    backfillEnabled: process.env.HUBSPOT_NOTES_SYNC_BACKFILL,
    path,
    notesStatus: cursor?.notesStatus,
    notesDryRunVerifiedAt: cursor?.notesDryRunVerifiedAt,
  });
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: number }).code === 11000
  );
}

async function resolveNoteTypeAndStatus(
  workspaceId: string,
  activityTypeKey: "note" | "email",
): Promise<{ typeId: string; statusId: string }> {
  const type = await findDictionaryItemByTypeAndKey(workspaceId, "activity_type", activityTypeKey);
  if (!type?.isActive) {
    throw new AppError("INTERNAL_ERROR", `Activity type '${activityTypeKey}' is not configured.`, {
      expose: false,
    });
  }
  const status = await findDictionaryItemByTypeAndKey(workspaceId, "activity_status", "completed");
  if (!status?.isActive) {
    throw new AppError("INTERNAL_ERROR", "Completed activity status is not configured.", {
      expose: false,
    });
  }
  return { typeId: type.id, statusId: status.id };
}

async function resolveNotesLead(input: {
  workspaceId: string;
  contactId: string;
  emailNormalized?: string | null;
}): Promise<{ lead: LeadRecord | null; identity: ReturnType<typeof resolveHubSpotNotesLeadMatch> }> {
  const byContact = await findLeadByHubSpotContactId(input.workspaceId, input.contactId);
  let emailIds: string[] = [];
  if (!byContact && input.emailNormalized) {
    const candidates = await listActiveLeadsByNormalizedEmail(input.workspaceId, input.emailNormalized);
    emailIds = candidates.map((lead) => lead.id);
  }
  const identity = resolveHubSpotNotesLeadMatch({
    byContactIdLeadId: byContact?.id ?? null,
    emailCandidateLeadIds: emailIds,
  });
  if (identity.kind !== "match") {
    return { lead: null, identity };
  }
  if (byContact && identity.leadId === byContact.id) {
    return { lead: byContact, identity };
  }
  const matches = input.emailNormalized
    ? await listActiveLeadsByNormalizedEmail(input.workspaceId, input.emailNormalized)
    : [];
  const lead = matches.find((item) => item.id === identity.leadId) ?? null;
  return { lead, identity };
}

export async function processHubSpotNotesForContact(input: {
  integration: IntegrationRecord;
  contactId: string;
  path: "incremental" | "backfill" | "dry-run";
  email?: string | null;
  formMessage?: string | null;
  formLabel?: string | null;
  formOccurredAt?: string | null;
  cursor?: HubSpotSyncCursorRecord | null;
}): Promise<HubSpotNotesSyncSummary> {
  const summary = emptySummary();
  summary.contactsScanned = 1;
  summary.searched = true;
  const cursor =
    input.cursor ??
    (await ensureHubSpotSyncCursor({
      workspaceId: input.integration.workspaceId,
      integrationId: input.integration.id,
      portalId: input.integration.externalAccountId ?? "",
    }));
  const gate = notesGate(input.path, cursor);
  if (!gate.plan && !gate.mutate) {
    summary.skipped = 1;
    return summary;
  }

  const credentials = decodeHubSpotCredentials(input.integration.credentialsEncrypted);
  const workspaceId = input.integration.workspaceId;
  const contactId = String(input.contactId).trim();

  let emailNormalized = input.email ? normalizeLeadEmail(input.email).emailNormalized : null;
  let formMessage = input.formMessage ?? null;
  let formOccurredAt = input.formOccurredAt ?? null;
  if (!emailNormalized || formMessage == null) {
    try {
      const contact = await fetchHubSpotContact({
        accessToken: credentials.accessToken,
        contactId,
      });
      emailNormalized = emailNormalized ?? (contact.email ? normalizeLeadEmail(contact.email).emailNormalized : null);
      formMessage = formMessage ?? contact.properties.message ?? null;
      formOccurredAt = formOccurredAt ?? contact.createdAt;
    } catch {
      // Timeline list still runs; identity may park without email.
    }
  }

  const { lead, identity } = await resolveNotesLead({
    workspaceId,
    contactId,
    emailNormalized,
  });
  if (identity.kind === "park" || !lead || !lead.projectId) {
    summary.parked += 1;
    await Promise.resolve(
      writeIntegrationLog({
        workspaceId,
        integrationId: input.integration.id,
        direction: "inbound",
        status: "success",
        eventType: "hubspot.notes.parked",
        payloadSummary: {
          contactId,
          reason: identity.kind === "park" ? identity.reason : "missing_project",
        },
      }),
    ).catch(() => undefined);
    return summary;
  }

  const items = await listHubSpotContactTimelineItems({
    accessToken: credentials.accessToken,
    contactId,
    formMessage,
    formLabel: input.formLabel,
    formOccurredAt,
  });
  summary.received = items.length;
  await ensureDefaultDictionaries(workspaceId);

  for (const item of items) {
    const classified = classifyHubSpotTimelineItem(item);
    if (!classified.include) {
      summary.excluded += 1;
      continue;
    }
    const planned = planHubSpotNoteActivity(item);
    if (!planned) {
      summary.excluded += 1;
      continue;
    }

    const eventKey = hubspotNoteEventKey({
      externalActivityId: planned.externalActivityId,
      lastModifiedAt: item.lastModifiedAt,
    });
    const claimed = await claimHubSpotSyncEvent({
      workspaceId,
      integrationId: input.integration.id,
      eventKey,
      contactId,
      subscriptionType: `notes.${classified.kind}`,
      lastModifiedAt: item.lastModifiedAt,
      payloadSummary: {
        contactId,
        externalActivityId: planned.externalActivityId,
        kind: classified.kind,
        path: input.path,
      },
    });
    if (!claimed.created && claimed.record.status === "processed") {
      summary.duplicates += 1;
      continue;
    }
    if (!claimed.created && claimed.record.status === "dead_letter") {
      summary.skipped += 1;
      continue;
    }

    const existing = await findActivityByHubSpotExternalId(workspaceId, planned.externalActivityId);
    if (existing) {
      summary.duplicates += 1;
      await updateHubSpotSyncEvent(workspaceId, claimed.record.id, {
        status: "processed",
        outcome: "duplicate",
        leadId: lead.id,
      });
      continue;
    }

    if (!gate.mutate) {
      summary.wouldCreate += 1;
      await updateHubSpotSyncEvent(workspaceId, claimed.record.id, {
        status: "processed",
        outcome: "would_create",
        leadId: lead.id,
      });
      continue;
    }

    try {
      const dictionaries = await resolveNoteTypeAndStatus(workspaceId, planned.activityTypeKey);
      const occurredAt = new Date(planned.occurredAt);
      const activity = await createActivity({
        workspaceId,
        projectId: lead.projectId,
        leadId: lead.id,
        typeId: dictionaries.typeId,
        statusId: dictionaries.statusId,
        ownerId: null,
        assignedTo: null,
        title: planned.title,
        description: planned.description,
        dueDate: null,
        completedAt: occurredAt,
        cancelledAt: null,
        outcome: null,
        nextActionDate: null,
        createdBy: input.integration.createdBy,
        createdAt: occurredAt,
        hubspotExternalActivityId: planned.externalActivityId,
        attributes: {
          integration: {
            ...planned.provenance,
            idempotencyKey: planned.idempotencyKey,
            integrationId: input.integration.id,
          },
        },
      });
      await updateHubSpotSyncEvent(workspaceId, claimed.record.id, {
        status: "processed",
        outcome: "created",
        leadId: lead.id,
      });
      await createAuditLog({
        workspaceId,
        actorId: input.integration.createdBy,
        action: "integration.hubspot_notes_created",
        entityType: "activity",
        entityId: activity.id,
        after: {
          hubspotContactId: contactId,
          externalActivityId: planned.externalActivityId,
          triggerAutomation: false,
          mutateLeadProject: false,
          mutateLeadStatus: false,
          source: HUBSPOT_NOTES_SYNC_INTELLIGENCE_SOURCE,
        },
      });
      summary.created += 1;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        summary.duplicates += 1;
        await updateHubSpotSyncEvent(workspaceId, claimed.record.id, {
          status: "processed",
          outcome: "duplicate",
          leadId: lead.id,
        });
        continue;
      }
      const attempts = claimed.record.attemptCount + 1;
      await Promise.resolve(
        updateHubSpotSyncEvent(workspaceId, claimed.record.id, {
          status: nextHubSpotSyncEventStatus({ attempts, failed: true }),
          outcome: "failed",
          errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR",
          attemptCount: attempts,
        }),
      ).catch(() => undefined);
      summary.failed += 1;
    }
  }

  return summary;
}

function addNotesSummaries(target: HubSpotNotesSyncSummary, source: HubSpotNotesSyncSummary): void {
  target.received += source.received;
  target.created += source.created;
  target.duplicates += source.duplicates;
  target.skipped += source.skipped;
  target.parked += source.parked;
  target.failed += source.failed;
  target.excluded += source.excluded;
  target.wouldCreate += source.wouldCreate;
  target.contactsScanned += source.contactsScanned;
  target.searched = target.searched || source.searched;
}

export async function backfillHubSpotNotes(input: {
  integration: IntegrationRecord;
  path?: "backfill" | "dry-run";
  limit?: number;
}): Promise<HubSpotNotesSyncSummary> {
  const path = input.path ?? "backfill";
  const cursor = await ensureHubSpotSyncCursor({
    workspaceId: input.integration.workspaceId,
    integrationId: input.integration.id,
    portalId: input.integration.externalAccountId ?? "",
  });
  const gate = notesGate(path, cursor);
  const totals = emptySummary();
  totals.searched = true;
  if (!gate.plan && !gate.mutate) {
    return totals;
  }

  const credentials = decodeHubSpotCredentials(input.integration.credentialsEncrypted);
  await assertHubSpotAccessToken(credentials.accessToken);

  const leads = await findLeadsWithHubSpotContactIdempotency(input.integration.workspaceId);
  const limited = typeof input.limit === "number" ? leads.slice(0, input.limit) : leads;
  for (const lead of limited) {
    const contactId = hubspotContactIdFromLeadAttributes(lead.attributes);
    if (!contactId) {
      continue;
    }
    const page = await processHubSpotNotesForContact({
      integration: input.integration,
      contactId,
      path,
      email: lead.email,
      cursor,
    });
    addNotesSummaries(totals, page);
  }
  return totals;
}

export async function reconcileHubSpotNotes(input?: {
  workspaceId?: string;
  limit?: number;
}): Promise<HubSpotNotesSyncSummary & { integrations: number }> {
  const integrations = input?.workspaceId
    ? await findIntegrations(input.workspaceId, { type: "hubspot", status: "active" })
    : await collectActiveHubSpotIntegrations();
  const totals = emptySummary();
  let integrationCount = 0;

  for (const integration of integrations) {
    const cursor = await findHubSpotSyncCursor(integration.workspaceId, integration.id);
    const gate = notesGate("incremental", cursor);
    if (!gate.plan) {
      continue;
    }
    integrationCount += 1;
    const credentials = decodeHubSpotCredentials(integration.credentialsEncrypted);
    await assertHubSpotAccessToken(credentials.accessToken);

    const modifiedAfter =
      cursor?.lastNotesReconciledModifiedAt?.toISOString() ??
      cursor?.cutoverAt?.toISOString() ??
      new Date(0).toISOString();
    const page = await searchHubSpotNoteObjectsModifiedSince({
      accessToken: credentials.accessToken,
      modifiedAfterIso: modifiedAfter,
      after: cursor?.lastNotesReconciledAfter,
      limit: input?.limit ?? 25,
    });
    totals.searched = true;

    const contactIds = new Set<string>();
    for (const noteId of page.ids) {
      const ids = await fetchHubSpotNoteContactIds({
        accessToken: credentials.accessToken,
        noteId,
      });
      ids.forEach((id) => contactIds.add(id));
    }

    let pageFailed = false;
    for (const contactId of contactIds) {
      try {
        const result = await processHubSpotNotesForContact({
          integration,
          contactId,
          path: "incremental",
          cursor,
        });
        addNotesSummaries(totals, result);
        if (result.failed > 0) {
          pageFailed = true;
        }
      } catch {
        totals.failed += 1;
        pageFailed = true;
      }
    }

    if (!pageFailed) {
      await Promise.resolve(
        updateHubSpotSyncCursor(integration.workspaceId, integration.id, {
          lastNotesReconciledModifiedAt: page.nextAfter
            ? cursor?.lastNotesReconciledModifiedAt ?? new Date(modifiedAfter)
            : new Date(),
          lastNotesReconciledAfter: page.nextAfter,
          lastNotesReconciledContactId: [...contactIds].at(-1) ?? cursor?.lastNotesReconciledContactId,
        }),
      ).catch(() => undefined);
    }
  }

  return { ...totals, integrations: integrationCount };
}

async function collectActiveHubSpotIntegrations(): Promise<IntegrationRecord[]> {
  const { findAllWorkspaces } = await import("@/server/repositories/workspaces");
  const workspaces = await findAllWorkspaces();
  const all: IntegrationRecord[] = [];
  for (const workspace of workspaces) {
    all.push(...(await findIntegrations(workspace.id, { type: "hubspot", status: "active" })));
  }
  return all;
}

export async function prepareHubSpotNotesCutover(input: {
  workspaceId: string;
  integrationId: string;
  portalId: string;
  verifyDryRun?: boolean;
  activate?: boolean;
  dryRunSummary?: Record<string, unknown>;
}): Promise<HubSpotSyncCursorRecord> {
  const cursor = await ensureHubSpotSyncCursor({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    portalId: input.portalId,
  });
  const patch: Parameters<typeof updateHubSpotSyncCursor>[2] = {};
  if (input.dryRunSummary) {
    patch.notesDryRunSummary = input.dryRunSummary;
  }
  const summaryForVerify = input.dryRunSummary ?? cursor.notesDryRunSummary;
  if (input.verifyDryRun) {
    const verification = evaluateHubSpotNotesDryRun({
      searched: summaryForVerify?.searched === true,
      contactsScanned: Number(summaryForVerify?.contactsScanned ?? 0),
    });
    if (!verification.ok) {
      throw new AppError(
        "VALIDATION_ERROR",
        verification.reason === "search_not_run"
          ? "Notes dry-run must search HubSpot before verification."
          : "Notes dry-run scanned zero HubSpot-linked contacts; verification is invalid.",
      );
    }
    patch.notesDryRunVerifiedAt = new Date();
    patch.notesStatus = "dry_run_verified";
  }
  if (input.activate) {
    const verified = input.verifyDryRun || cursor.notesDryRunVerifiedAt;
    if (!verified) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Notes dry-run must be verified before activating HubSpot notes sync.",
      );
    }
    patch.notesStatus = "active";
  }
  const updated = await updateHubSpotSyncCursor(input.workspaceId, input.integrationId, patch);
  return updated ?? cursor;
}

export { HUBSPOT_NOTES_SYNC_SIDE_EFFECT_GUARD, hubspotNoteIdempotencyKey };
