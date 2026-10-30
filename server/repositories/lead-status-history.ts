import "server-only";

import mongoose from "mongoose";

import {
  LeadStatusHistoryModel,
  type LeadStatusHistorySource,
} from "@/models/lead-status-history";
import { connectDb } from "@/server/db/mongoose";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type LeadStatusHistoryRecord = {
  id: string;
  workspaceId: string;
  leadId: string;
  projectId: string;
  fromStatusId: string | null;
  toStatusId: string;
  changedAt: Date;
  actorId: string | null;
  source: LeadStatusHistorySource;
  meta: Record<string, unknown> | null;
  createdAt: Date;
};

export type InsertLeadStatusHistoryInput = {
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

function toRecord(document: {
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  leadId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  fromStatusId?: mongoose.Types.ObjectId | null;
  toStatusId: mongoose.Types.ObjectId;
  changedAt: Date;
  actorId?: mongoose.Types.ObjectId | null;
  source: LeadStatusHistorySource;
  meta?: Record<string, unknown> | null;
  createdAt: Date;
}): LeadStatusHistoryRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    leadId: document.leadId.toString(),
    projectId: document.projectId.toString(),
    fromStatusId: document.fromStatusId?.toString() ?? null,
    toStatusId: document.toStatusId.toString(),
    changedAt: document.changedAt,
    actorId: document.actorId?.toString() ?? null,
    source: document.source,
    meta: document.meta ?? null,
    createdAt: document.createdAt,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: number }).code === 11000
  );
}

export async function insertLeadStatusHistory(
  input: InsertLeadStatusHistoryInput,
): Promise<LeadStatusHistoryRecord | null> {
  await connectDb();
  const changedAt = input.changedAt ?? new Date();
  try {
    const document = await LeadStatusHistoryModel.create({
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      projectId: input.projectId,
      fromStatusId: input.fromStatusId ?? null,
      toStatusId: input.toStatusId,
      changedAt,
      actorId: input.actorId ?? null,
      source: input.source,
      meta: input.meta ?? null,
    });
    return toRecord(document.toObject());
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return null;
    }
    throw error;
  }
}

export async function countLeadStatusHistoryForProject(
  workspaceId: string,
  projectId: string,
): Promise<number> {
  await connectDb();
  return LeadStatusHistoryModel.countDocuments(
    withWorkspaceScope(workspaceId, {
      projectId: new mongoose.Types.ObjectId(projectId),
    }),
  );
}

/**
 * Distinct non-archived leads on a project that ever entered any of the given statuses.
 * Optionally require the transition to have occurred on/after `changedAtFrom`.
 */
export async function countDistinctLeadsEverReachedStatuses(input: {
  workspaceId: string;
  projectId: string;
  statusIds: string[];
  changedAtFrom?: Date | null;
  includeArchivedLeads?: boolean;
}): Promise<number> {
  if (input.statusIds.length === 0) return 0;
  await connectDb();

  const match: Record<string, unknown> = {
    ...withWorkspaceScope(input.workspaceId, {
      projectId: new mongoose.Types.ObjectId(input.projectId),
      toStatusId: {
        $in: input.statusIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    }),
    workspaceId: new mongoose.Types.ObjectId(input.workspaceId),
  };
  if (input.changedAtFrom) {
    match.changedAt = { $gte: input.changedAtFrom };
  }

  const pipeline: mongoose.PipelineStage[] = [
    { $match: match },
    { $group: { _id: "$leadId" } },
  ];

  if (!input.includeArchivedLeads) {
    pipeline.push(
      {
        $lookup: {
          from: "leads",
          localField: "_id",
          foreignField: "_id",
          as: "lead",
        },
      },
      { $unwind: "$lead" },
      { $match: { "lead.archivedAt": null } },
    );
  }

  pipeline.push({ $count: "count" });

  const results = await LeadStatusHistoryModel.aggregate<{ count: number }>(
    pipeline,
  );
  return results[0]?.count ?? 0;
}

export async function listStatusHistoryLeadIdsMissingSeed(
  workspaceId: string,
  projectId: string,
  limit = 500,
): Promise<string[]> {
  await connectDb();
  const { LeadModel } = await import("@/models/lead");

  const leads = await LeadModel.aggregate<{ _id: mongoose.Types.ObjectId }>([
    {
      $match: {
        ...withWorkspaceScope(workspaceId, {
          projectId: new mongoose.Types.ObjectId(projectId),
          archivedAt: null,
        }),
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
      },
    },
    {
      $lookup: {
        from: "leadstatushistories",
        let: { leadId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$leadId", "$$leadId"] },
            },
          },
          { $limit: 1 },
        ],
        as: "history",
      },
    },
    { $match: { history: { $size: 0 } } },
    { $project: { _id: 1 } },
    { $limit: limit },
  ]);

  return leads.map((row) => row._id.toString());
}
