import "server-only";

import mongoose from "mongoose";

import { connectDb } from "@/server/db/mongoose";
import { ActivityModel } from "@/models/activity";
import { AuditLogModel } from "@/models/audit-log";
import { LeadModel } from "@/models/lead";
import { VisitSessionModel } from "@/models/visit-session";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type StaleNewLeadCandidate = {
  id: string;
  projectId: string;
  statusId: string;
  createdAt: Date;
  lastContactedAt: Date | null;
  attributes: Record<string, unknown>;
  archivedAt: Date | null;
};

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

/**
 * New, non-archived leads whose CRM record and lastContactedAt are both older
 * than the cutoff. Remaining signals are checked in the service.
 */
export async function findStaleNewLeadCandidates(input: {
  workspaceId: string;
  newStatusId: string;
  cutoff: Date;
  afterId?: string | null;
  excludedProjectIds?: string[];
  limit: number;
}): Promise<StaleNewLeadCandidate[]> {
  await connectDb();

  const filter: Record<string, unknown> = {
    statusId: input.newStatusId,
    archivedAt: null,
    createdAt: { $lte: input.cutoff },
    $or: [{ lastContactedAt: null }, { lastContactedAt: { $lte: input.cutoff } }],
  };
  if (input.afterId) {
    filter._id = { $gt: input.afterId };
  }
  if (input.excludedProjectIds && input.excludedProjectIds.length > 0) {
    filter.projectId = { $nin: input.excludedProjectIds };
  }

  const documents = await LeadModel.find(withWorkspaceScope(input.workspaceId, filter))
    .select({
      projectId: 1,
      statusId: 1,
      createdAt: 1,
      lastContactedAt: 1,
      attributes: 1,
      archivedAt: 1,
    })
    .sort({ _id: 1 })
    .limit(input.limit)
    .lean<
      Array<{
        _id: mongoose.Types.ObjectId;
        projectId: mongoose.Types.ObjectId;
        statusId: mongoose.Types.ObjectId;
        createdAt: Date;
        lastContactedAt?: Date | null;
        attributes?: Record<string, unknown> | null;
        archivedAt?: Date | null;
      }>
    >();

  return documents.map((document) => ({
    id: document._id.toString(),
    projectId: document.projectId.toString(),
    statusId: document.statusId.toString(),
    createdAt: document.createdAt,
    lastContactedAt: document.lastContactedAt ?? null,
    attributes: document.attributes ?? {},
    archivedAt: document.archivedAt ?? null,
  }));
}

async function latestByLead(
  model: mongoose.Model<never>,
  match: Record<string, unknown>,
  dateField: string,
): Promise<Map<string, Date>> {
  const rows = await model.aggregate<{ _id: mongoose.Types.ObjectId | string; at: Date }>([
    { $match: match },
    { $group: { _id: "$leadId", at: { $max: `$${dateField}` } } },
  ]);
  return new Map(rows.filter((row) => row.at).map((row) => [String(row._id), row.at]));
}

/** Latest Activity touch per lead; archived activities still count as treatment. */
export async function findLatestActivityAtByLead(
  workspaceId: string,
  leadIds: string[],
): Promise<Map<string, Date>> {
  if (leadIds.length === 0) {
    return new Map();
  }
  await connectDb();
  return latestByLead(
    ActivityModel as unknown as mongoose.Model<never>,
    { workspaceId: toObjectId(workspaceId), leadId: { $in: leadIds.map(toObjectId) } },
    "updatedAt",
  );
}

export async function findLatestVisitSessionAtByLead(
  workspaceId: string,
  leadIds: string[],
): Promise<Map<string, Date>> {
  if (leadIds.length === 0) {
    return new Map();
  }
  await connectDb();
  return latestByLead(
    VisitSessionModel as unknown as mongoose.Model<never>,
    { workspaceId: toObjectId(workspaceId), leadId: { $in: leadIds.map(toObjectId) } },
    "updatedAt",
  );
}

export async function findLatestTreatmentAuditAtByLead(
  workspaceId: string,
  leadIds: string[],
  actions: readonly string[],
): Promise<Map<string, Date>> {
  if (leadIds.length === 0) {
    return new Map();
  }
  await connectDb();
  const rows = await AuditLogModel.aggregate<{ _id: string; at: Date }>([
    {
      $match: {
        workspaceId: toObjectId(workspaceId),
        entityType: "lead",
        entityId: { $in: leadIds },
        action: { $in: [...actions] },
      },
    },
    { $group: { _id: "$entityId", at: { $max: "$createdAt" } } },
  ]);
  return new Map(rows.filter((row) => row.at).map((row) => [String(row._id), row.at]));
}

/**
 * Compare-and-set: only flips the lead if it is still New and not archived,
 * so a concurrent human update always wins. Only statusId (and the
 * Mongoose-managed updatedAt) change.
 */
export async function markLeadUntreatedIfStillNew(input: {
  workspaceId: string;
  leadId: string;
  newStatusId: string;
  untreatedStatusId: string;
}): Promise<boolean> {
  await connectDb();
  const result = await LeadModel.updateOne(
    withWorkspaceScope(input.workspaceId, {
      _id: input.leadId,
      statusId: input.newStatusId,
      archivedAt: null,
    }),
    { $set: { statusId: input.untreatedStatusId } },
  );
  return result.modifiedCount > 0;
}
