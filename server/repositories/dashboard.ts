import "server-only";

import { Types } from "mongoose";

import { ActivityModel } from "@/models/activity";
import { LeadModel } from "@/models/lead";
import { OpportunityModel } from "@/models/opportunity";
import { PropertyModel } from "@/models/property";
import { connectDb } from "@/server/db/mongoose";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type GroupCount = {
  id: string | null;
  count: number;
};

export type CurrencySum = {
  currency: string;
  amount: number;
};

function toObjectIdArray(ids: string[]): Types.ObjectId[] {
  return ids.map((id) => new Types.ObjectId(id));
}

function withOptionalProjectScope(
  workspaceId: string,
  filter: Record<string, unknown>,
  projectId?: string,
): Record<string, unknown> {
  const scoped = withWorkspaceScope(workspaceId, filter);

  if (projectId) {
    return { ...scoped, projectId: new Types.ObjectId(projectId) };
  }

  return scoped;
}

export async function countLeadsCreatedInRange(
  workspaceId: string,
  from: Date,
  to: Date,
  projectId?: string,
): Promise<number> {
  await connectDb();
  return LeadModel.countDocuments(
    withOptionalProjectScope(
      workspaceId,
      {
        archivedAt: null,
        createdAt: { $gte: from, $lte: to },
      },
      projectId,
    ),
  );
}

export async function countOpportunitiesByStatusIds(
  workspaceId: string,
  statusIds: string[],
  projectId?: string,
): Promise<number> {
  if (statusIds.length === 0) {
    return 0;
  }

  await connectDb();
  return OpportunityModel.countDocuments(
    withOptionalProjectScope(
      workspaceId,
      {
        archivedAt: null,
        statusId: { $in: toObjectIdArray(statusIds) },
      },
      projectId,
    ),
  );
}

export async function countWonOpportunitiesInRange(
  workspaceId: string,
  wonStatusIds: string[],
  from: Date,
  to: Date,
  projectId?: string,
): Promise<number> {
  if (wonStatusIds.length === 0) {
    return 0;
  }

  await connectDb();
  return OpportunityModel.countDocuments(
    withOptionalProjectScope(
      workspaceId,
      {
        archivedAt: null,
        statusId: { $in: toObjectIdArray(wonStatusIds) },
        $or: [
          { wonAt: { $gte: from, $lte: to } },
          { wonAt: null, closedAt: { $gte: from, $lte: to } },
        ],
      },
      projectId,
    ),
  );
}

export async function countLostOpportunitiesInRange(
  workspaceId: string,
  lostStatusIds: string[],
  from: Date,
  to: Date,
  projectId?: string,
): Promise<number> {
  if (lostStatusIds.length === 0) {
    return 0;
  }

  await connectDb();
  return OpportunityModel.countDocuments(
    withOptionalProjectScope(
      workspaceId,
      {
        archivedAt: null,
        statusId: { $in: toObjectIdArray(lostStatusIds) },
        $or: [
          { lostAt: { $gte: from, $lte: to } },
          { lostAt: null, closedAt: { $gte: from, $lte: to } },
        ],
      },
      projectId,
    ),
  );
}

export async function sumOpportunityValuesByCurrency(
  workspaceId: string,
  statusIds: string[],
  dateFilter?: { from: Date; to: Date; field: "won" | "lost" },
  projectId?: string,
): Promise<CurrencySum[]> {
  if (statusIds.length === 0) {
    return [];
  }

  await connectDb();

  const match: Record<string, unknown> = {
    archivedAt: null,
    statusId: { $in: toObjectIdArray(statusIds) },
    value: { $ne: null },
  };

  if (dateFilter) {
    const dateField = dateFilter.field === "won" ? "wonAt" : "lostAt";
    match.$or = [
      { [dateField]: { $gte: dateFilter.from, $lte: dateFilter.to } },
      {
        [dateField]: null,
        closedAt: { $gte: dateFilter.from, $lte: dateFilter.to },
      },
    ];
  }

  const results = await OpportunityModel.aggregate<CurrencySum>([
    { $match: withOptionalProjectScope(workspaceId, match, projectId) },
    {
      $group: {
        _id: "$currency",
        amount: { $sum: "$value" },
      },
    },
    {
      $project: {
        _id: 0,
        currency: "$_id",
        amount: 1,
      },
    },
    { $sort: { currency: 1 } },
  ]);

  return results.map((row) => ({
    currency: row.currency,
    amount: row.amount,
  }));
}

export async function countActivitiesDueToday(
  workspaceId: string,
  pendingStatusIds: string[],
  dayStart: Date,
  dayEnd: Date,
  projectId?: string,
): Promise<number> {
  if (pendingStatusIds.length === 0) {
    return 0;
  }

  await connectDb();
  return ActivityModel.countDocuments(
    withOptionalProjectScope(
      workspaceId,
      {
        archivedAt: null,
        statusId: { $in: toObjectIdArray(pendingStatusIds) },
        dueDate: { $gte: dayStart, $lte: dayEnd },
      },
      projectId,
    ),
  );
}

export async function countOverdueActivities(
  workspaceId: string,
  pendingStatusIds: string[],
  now: Date,
  projectId?: string,
): Promise<number> {
  if (pendingStatusIds.length === 0) {
    return 0;
  }

  await connectDb();
  return ActivityModel.countDocuments(
    withOptionalProjectScope(
      workspaceId,
      {
        archivedAt: null,
        statusId: { $in: toObjectIdArray(pendingStatusIds) },
        dueDate: { $ne: null, $lt: now },
      },
      projectId,
    ),
  );
}

export async function groupLeadsBySource(
  workspaceId: string,
  from: Date,
  to: Date,
  projectId?: string,
): Promise<GroupCount[]> {
  await connectDb();

  const results = await LeadModel.aggregate<GroupCount>([
    {
      $match: withOptionalProjectScope(
        workspaceId,
        {
          archivedAt: null,
          createdAt: { $gte: from, $lte: to },
        },
        projectId,
      ),
    },
    {
      $group: {
        _id: "$sourceId",
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        id: {
          $cond: [
            { $eq: ["$_id", null] },
            null,
            { $toString: "$_id" },
          ],
        },
        count: 1,
      },
    },
  ]);

  return results;
}

export async function groupPropertiesByStatus(
  workspaceId: string,
  projectId?: string,
): Promise<GroupCount[]> {
  await connectDb();

  const results = await PropertyModel.aggregate<GroupCount>([
    {
      $match: withOptionalProjectScope(
        workspaceId,
        {
          archivedAt: null,
        },
        projectId,
      ),
    },
    {
      $group: {
        _id: "$statusId",
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        count: 1,
      },
    },
  ]);

  return results;
}

export async function groupOpportunitiesByStatus(
  workspaceId: string,
  projectId?: string,
): Promise<Array<GroupCount & { values: CurrencySum[] }>> {
  await connectDb();

  const results = await OpportunityModel.aggregate<{
    id: string;
    count: number;
    values: Array<{ currency: string; amount: number }>;
  }>([
    {
      $match: withOptionalProjectScope(
        workspaceId,
        {
          archivedAt: null,
        },
        projectId,
      ),
    },
    {
      $group: {
        _id: {
          statusId: "$statusId",
          currency: "$currency",
        },
        amount: { $sum: { $ifNull: ["$value", 0] } },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: "$_id.statusId",
        count: { $sum: "$count" },
        values: {
          $push: {
            currency: "$_id.currency",
            amount: "$amount",
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        count: 1,
        values: 1,
      },
    },
  ]);

  return results;
}
