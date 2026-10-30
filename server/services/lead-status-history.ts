import "server-only";

import { AuditLogModel } from "@/models/audit-log";
import { LeadModel } from "@/models/lead";
import type { LeadStatusHistorySource } from "@/models/lead-status-history";
import { connectDb } from "@/server/db/mongoose";
import {
  countDistinctLeadsEverReachedStatuses,
  countLeadStatusHistoryForProject,
  countLeadStatusTransitionsForProject,
  insertLeadStatusHistory,
  listStatusHistoryLeadIdsMissingSeed,
} from "@/server/repositories/lead-status-history";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import mongoose from "mongoose";

export type RecordLeadStatusChangeInput = {
  workspaceId: string;
  leadId: string;
  projectId: string;
  fromStatusId?: string | null;
  toStatusId: string;
  changedAt?: Date;
  actorId?: string | null;
  source: LeadStatusHistorySource;
  meta?: Record<string, unknown> | null;
};

/**
 * Append a status history event. Safe to call after the lead row is updated.
 * Duplicate create/backfill keys are ignored.
 */
export async function recordLeadStatusChange(
  input: RecordLeadStatusChangeInput,
): Promise<void> {
  await insertLeadStatusHistory({
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    projectId: input.projectId,
    fromStatusId: input.fromStatusId ?? null,
    toStatusId: input.toStatusId,
    changedAt: input.changedAt,
    actorId: input.actorId ?? null,
    source: input.source,
    meta: input.meta ?? null,
  });
}

export async function projectHasLeadStatusHistory(
  workspaceId: string,
  projectId: string,
): Promise<boolean> {
  return (await countLeadStatusHistoryForProject(workspaceId, projectId)) > 0;
}

/** Seed-only history is insufficient for conversion claims. */
export async function projectHasLeadStatusTransitions(
  workspaceId: string,
  projectId: string,
): Promise<boolean> {
  return (
    (await countLeadStatusTransitionsForProject(workspaceId, projectId)) > 0
  );
}

export async function countEverReachedForBuckets(input: {
  workspaceId: string;
  projectId: string;
  bucketStatusIds: Record<string, string[]>;
  changedAtFrom?: Date | null;
}): Promise<Record<string, number>> {
  const entries = await Promise.all(
    Object.entries(input.bucketStatusIds).map(async ([bucket, statusIds]) => {
      const count = await countDistinctLeadsEverReachedStatuses({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        statusIds,
        changedAtFrom: input.changedAtFrom,
      });
      return [bucket, count] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Seed missing initial stamps from current lead status + createdAt, then
 * replay `lead.status_changed` audit rows into the history collection.
 */
export async function backfillLeadStatusHistoryForProject(input: {
  workspaceId: string;
  projectId: string;
  actorId?: string | null;
  limit?: number;
}): Promise<{ seeded: number; fromAudits: number }> {
  await connectDb();
  const limit = input.limit ?? 2000;
  let seeded = 0;
  let fromAudits = 0;

  const missingIds = await listStatusHistoryLeadIdsMissingSeed(
    input.workspaceId,
    input.projectId,
    limit,
  );

  if (missingIds.length > 0) {
    const leads = await LeadModel.find(
      withWorkspaceScope(input.workspaceId, {
        _id: { $in: missingIds.map((id) => new mongoose.Types.ObjectId(id)) },
      }),
    )
      .select({ _id: 1, statusId: 1, projectId: 1, createdAt: 1, statusEnteredAt: 1 })
      .lean();

    for (const lead of leads) {
      const changedAt = lead.statusEnteredAt ?? lead.createdAt ?? new Date();
      const inserted = await insertLeadStatusHistory({
        workspaceId: input.workspaceId,
        leadId: lead._id.toString(),
        projectId: (lead.projectId as mongoose.Types.ObjectId).toString(),
        fromStatusId: null,
        toStatusId: (lead.statusId as mongoose.Types.ObjectId).toString(),
        changedAt,
        actorId: input.actorId ?? null,
        source: "backfill_seed",
        meta: { reason: "missing_history_seed" },
      });
      if (inserted) {
        seeded += 1;
        if (!lead.statusEnteredAt) {
          await LeadModel.updateOne(
            { _id: lead._id },
            { $set: { statusEnteredAt: changedAt } },
          );
        }
      }
    }
  }

  const projectLeadIds = await LeadModel.find(
    withWorkspaceScope(input.workspaceId, {
      projectId: new mongoose.Types.ObjectId(input.projectId),
    }),
  )
    .select({ _id: 1 })
    .lean();
  const projectLeadIdSet = new Set(
    projectLeadIds.map((lead) => lead._id.toString()),
  );

  if (projectLeadIdSet.size === 0) {
    return { seeded, fromAudits };
  }

  const audits = await AuditLogModel.find(
    withWorkspaceScope(input.workspaceId, {
      entityType: "lead",
      action: "lead.status_changed",
      entityId: { $in: [...projectLeadIdSet] },
    }),
  )
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  for (const audit of audits) {
    const afterStatusId =
      audit.after &&
      typeof audit.after === "object" &&
      "statusId" in audit.after
        ? String((audit.after as { statusId?: unknown }).statusId ?? "")
        : "";
    const beforeStatusId =
      audit.before &&
      typeof audit.before === "object" &&
      "statusId" in audit.before
        ? String((audit.before as { statusId?: unknown }).statusId ?? "")
        : null;
    if (!afterStatusId || !mongoose.isValidObjectId(afterStatusId)) {
      continue;
    }
    if (!projectLeadIdSet.has(audit.entityId)) {
      continue;
    }

    const source: LeadStatusHistorySource =
      audit.after &&
      typeof audit.after === "object" &&
      "automation" in (audit.after as object)
        ? "automation"
        : "backfill_audit";

    const inserted = await insertLeadStatusHistory({
      workspaceId: input.workspaceId,
      leadId: audit.entityId,
      projectId: input.projectId,
      fromStatusId:
        beforeStatusId && mongoose.isValidObjectId(beforeStatusId)
          ? beforeStatusId
          : null,
      toStatusId: afterStatusId,
      changedAt: audit.createdAt,
      actorId: audit.actorId?.toString() ?? null,
      source,
      meta: { auditId: audit._id.toString() },
    });
    if (inserted) fromAudits += 1;
  }

  return { seeded, fromAudits };
}
