import "server-only";

import { Types } from "mongoose";

import {
  cmpSourceCohortMongoFilter,
  isCmpCrmProjectIdentity,
  withLeadAcquisitionFilter,
  type LeadAcquisitionKind,
} from "@/lib/inbound-acquisition";
import { ActivityModel } from "@/models/activity";
import { LeadModel } from "@/models/lead";
import { LeadProjectMembershipModel } from "@/models/lead-project-membership";
import { OpportunityModel } from "@/models/opportunity";
import { ProjectModel } from "@/models/project";
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
  // Aggregations do not cast string IDs the way find/countDocuments do.
  // Always match ObjectId fields with ObjectId values (same pattern as projects.ts).
  const scoped = {
    ...withWorkspaceScope(workspaceId, filter),
    workspaceId: new Types.ObjectId(workspaceId),
  };

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
  acquisition: LeadAcquisitionKind | "all" = "genuine_inbound",
): Promise<number> {
  await connectDb();
  return LeadModel.countDocuments(
    withLeadAcquisitionFilter(
      withOptionalProjectScope(
        workspaceId,
        {
          archivedAt: null,
          createdAt: { $gte: from, $lte: to },
        },
        projectId,
      ),
      acquisition,
    ),
  );
}

export async function countLegacyImportedLeadsCreatedInRange(
  workspaceId: string,
  from: Date,
  to: Date,
  projectId?: string,
): Promise<number> {
  return countLeadsCreatedInRange(workspaceId, from, to, projectId, "legacy_import");
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
  acquisition: LeadAcquisitionKind | "all" = "genuine_inbound",
): Promise<GroupCount[]> {
  await connectDb();

  const results = await LeadModel.aggregate<GroupCount>([
    {
      $match: withLeadAcquisitionFilter(
        withOptionalProjectScope(
          workspaceId,
          {
            archivedAt: null,
            createdAt: { $gte: from, $lte: to },
          },
          projectId,
        ),
        acquisition,
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

export type CmpReconciliationProject = {
  id: string;
  name: string;
  reference: string | null;
  membershipCount: number;
};

export type CmpReconciliationResult = {
  sourceCohortCount: number;
  membershipCount: number;
  overlapCount: number;
  sourceOnlyCount: number;
  membershipOnlyCount: number;
  cmpProjects: CmpReconciliationProject[];
};

function toIdSet(ids: Array<Types.ObjectId | string>): Set<string> {
  return new Set(ids.map((id) => id.toString()));
}

export async function getCmpReconciliation(
  workspaceId: string,
  projectId?: string,
): Promise<CmpReconciliationResult> {
  await connectDb();
  const workspaceObjectId = new Types.ObjectId(workspaceId);

  const projects = await ProjectModel.find({
    workspaceId: workspaceObjectId,
    archivedAt: null,
  })
    .select({ name: 1, reference: 1 })
    .lean<Array<{ _id: Types.ObjectId; name?: string; reference?: string | null }>>();

  const cmpProjects = projects.filter((project) =>
    isCmpCrmProjectIdentity(project.name ?? null, project.reference ?? null),
  );
  const scopedCmpProjects = projectId
    ? cmpProjects.filter((project) => project._id.toString() === projectId)
    : cmpProjects;
  const cmpProjectIds = scopedCmpProjects.map((project) => project._id);

  const sourceMatch = withOptionalProjectScope(
    workspaceId,
    {
      archivedAt: null,
      ...cmpSourceCohortMongoFilter(),
    },
    projectId,
  );

  const sourceIds = toIdSet(await LeadModel.distinct("_id", sourceMatch));

  const [membershipLeadIds, primaryLeadIds] =
    cmpProjectIds.length === 0
      ? [[] as Types.ObjectId[], [] as Types.ObjectId[]]
      : await Promise.all([
          LeadProjectMembershipModel.distinct("leadId", {
            workspaceId: workspaceObjectId,
            projectId: { $in: cmpProjectIds },
            archivedAt: null,
          }),
          LeadModel.distinct("_id", {
            workspaceId: workspaceObjectId,
            projectId: { $in: cmpProjectIds },
            archivedAt: null,
          }),
        ]);

  const membershipIds = toIdSet([...membershipLeadIds, ...primaryLeadIds]);

  let overlapCount = 0;
  for (const id of sourceIds) {
    if (membershipIds.has(id)) {
      overlapCount += 1;
    }
  }

  const membershipCounts = await Promise.all(
    scopedCmpProjects.map(async (project) => {
      const [fromMemberships, fromPrimary] = await Promise.all([
        LeadProjectMembershipModel.distinct("leadId", {
          workspaceId: workspaceObjectId,
          projectId: project._id,
          archivedAt: null,
        }),
        LeadModel.distinct("_id", {
          workspaceId: workspaceObjectId,
          projectId: project._id,
          archivedAt: null,
        }),
      ]);
      return {
        id: project._id.toString(),
        name: project.name ?? "CMP",
        reference: project.reference ?? null,
        membershipCount: toIdSet([...fromMemberships, ...fromPrimary]).size,
      };
    }),
  );

  return {
    sourceCohortCount: sourceIds.size,
    membershipCount: membershipIds.size,
    overlapCount,
    sourceOnlyCount: sourceIds.size - overlapCount,
    membershipOnlyCount: membershipIds.size - overlapCount,
    cmpProjects: membershipCounts,
  };
}
