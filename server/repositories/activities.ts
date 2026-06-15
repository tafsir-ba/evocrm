import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { ActivityModel, type ActivityDocument } from "@/models/activity";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type ActivityRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  opportunityId: string | null;
  leadId: string | null;
  propertyId: string | null;
  typeId: string;
  statusId: string;
  ownerId: string | null;
  assignedTo: string | null;
  title: string;
  description: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  outcome: string | null;
  nextActionDate: Date | null;
  createdBy: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toActivityRecord(document: ActivityDocument): ActivityRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    projectId: document.projectId.toString(),
    opportunityId: document.opportunityId?.toString() ?? null,
    leadId: document.leadId?.toString() ?? null,
    propertyId: document.propertyId?.toString() ?? null,
    typeId: document.typeId.toString(),
    statusId: document.statusId.toString(),
    ownerId: document.ownerId?.toString() ?? null,
    assignedTo: document.assignedTo?.toString() ?? null,
    title: document.title,
    description: document.description ?? null,
    dueDate: document.dueDate ?? null,
    completedAt: document.completedAt ?? null,
    cancelledAt: document.cancelledAt ?? null,
    outcome: document.outcome ?? null,
    nextActionDate: document.nextActionDate ?? null,
    createdBy: document.createdBy.toString(),
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export type ActivityListFilter = {
  includeArchived?: boolean;
  projectId?: string;
  search?: string;
  typeId?: string;
  statusId?: string;
  assignedTo?: string;
  ownerId?: string;
  leadId?: string;
  propertyId?: string;
  opportunityId?: string;
  dueFrom?: Date;
  dueTo?: Date;
  createdFrom?: Date;
  createdTo?: Date;
  completedFrom?: Date;
  completedTo?: Date;
  pendingStatusIds?: string[];
  dueBefore?: Date;
  dueAfter?: Date;
  requireDueDate?: boolean;
  emptyResult?: boolean;
  page?: number;
  pageSize?: number;
};

function buildListQuery(filter: ActivityListFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (!filter.includeArchived) {
    query.archivedAt = null;
  }

  if (filter.projectId) {
    query.projectId = filter.projectId;
  }

  if (filter.typeId) {
    query.typeId = filter.typeId;
  }
  if (filter.pendingStatusIds && filter.pendingStatusIds.length > 0) {
    if (filter.statusId) {
      query.statusId = filter.pendingStatusIds.includes(filter.statusId)
        ? filter.statusId
        : { $in: [] };
    } else {
      query.statusId = { $in: filter.pendingStatusIds };
    }
  } else if (filter.statusId) {
    query.statusId = filter.statusId;
  }
  if (filter.assignedTo) {
    query.assignedTo = filter.assignedTo;
  }
  if (filter.ownerId) {
    query.ownerId = filter.ownerId;
  }
  if (filter.leadId) {
    query.leadId = filter.leadId;
  }
  if (filter.propertyId) {
    query.propertyId = filter.propertyId;
  }
  if (filter.opportunityId) {
    query.opportunityId = filter.opportunityId;
  }

  if (filter.requireDueDate || filter.dueBefore || filter.dueAfter || filter.dueFrom || filter.dueTo) {
    const dueDate: Record<string, unknown> = {};
    if (filter.requireDueDate) {
      dueDate.$ne = null;
    }
    if (filter.dueFrom) {
      dueDate.$gte = filter.dueFrom;
    }
    if (filter.dueTo) {
      dueDate.$lte = filter.dueTo;
    }
    if (filter.dueBefore) {
      dueDate.$lt = filter.dueBefore;
    }
    if (filter.dueAfter) {
      dueDate.$gte = filter.dueAfter;
    }
    query.dueDate = dueDate;
  }

  if (filter.createdFrom || filter.createdTo) {
    const createdAt: Record<string, Date> = {};
    if (filter.createdFrom) {
      createdAt.$gte = filter.createdFrom;
    }
    if (filter.createdTo) {
      createdAt.$lte = filter.createdTo;
    }
    query.createdAt = createdAt;
  }

  if (filter.completedFrom || filter.completedTo) {
    const completedAt: Record<string, Date> = {};
    if (filter.completedFrom) {
      completedAt.$gte = filter.completedFrom;
    }
    if (filter.completedTo) {
      completedAt.$lte = filter.completedTo;
    }
    query.completedAt = completedAt;
  }

  if (filter.search) {
    const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    query.$or = [{ title: regex }, { description: regex }, { outcome: regex }];
  }

  return query;
}

export async function findActivities(
  workspaceId: string,
  filter: ActivityListFilter = {},
): Promise<{ activities: ActivityRecord[]; total: number }> {
  if (filter.emptyResult) {
    return { activities: [], total: 0 };
  }

  await connectDb();
  const query = withWorkspaceScope(workspaceId, buildListQuery(filter));
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const [documents, total] = await Promise.all([
    ActivityModel.find(query)
      .sort({ dueDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean<ActivityDocument[]>(),
    ActivityModel.countDocuments(query),
  ]);

  return {
    activities: documents.map(toActivityRecord),
    total,
  };
}

export async function findActivityById(
  workspaceId: string,
  activityId: string,
): Promise<ActivityRecord | null> {
  await connectDb();
  const document = await ActivityModel.findOne(
    withWorkspaceScope(workspaceId, { _id: activityId }),
  ).lean<ActivityDocument>();
  return document ? toActivityRecord(document) : null;
}

export async function createActivity(input: {
  workspaceId: string;
  projectId: string;
  opportunityId?: string | null;
  leadId?: string | null;
  propertyId?: string | null;
  typeId: string;
  statusId: string;
  ownerId?: string | null;
  assignedTo?: string | null;
  title: string;
  description?: string | null;
  dueDate?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  outcome?: string | null;
  nextActionDate?: Date | null;
  createdBy: string;
}): Promise<ActivityRecord> {
  await connectDb();
  const document = await ActivityModel.create({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    opportunityId: input.opportunityId ?? null,
    leadId: input.leadId ?? null,
    propertyId: input.propertyId ?? null,
    typeId: input.typeId,
    statusId: input.statusId,
    ownerId: input.ownerId ?? null,
    assignedTo: input.assignedTo ?? null,
    title: input.title.trim(),
    description: input.description ?? null,
    dueDate: input.dueDate ?? null,
    completedAt: input.completedAt ?? null,
    cancelledAt: input.cancelledAt ?? null,
    outcome: input.outcome ?? null,
    nextActionDate: input.nextActionDate ?? null,
    createdBy: input.createdBy,
    archivedAt: null,
  });
  return toActivityRecord(document.toObject() as ActivityDocument);
}

export async function updateActivity(
  workspaceId: string,
  activityId: string,
  input: Partial<{
    projectId: string;
    opportunityId: string | null;
    leadId: string | null;
    propertyId: string | null;
    typeId: string;
    statusId: string;
    ownerId: string | null;
    assignedTo: string | null;
    title: string;
    description: string | null;
    dueDate: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    outcome: string | null;
    nextActionDate: Date | null;
  }>,
): Promise<ActivityRecord | null> {
  await connectDb();
  const document = await ActivityModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: activityId, archivedAt: null }),
    { $set: input },
    { new: true },
  ).lean<ActivityDocument>();
  return document ? toActivityRecord(document) : null;
}

export async function archiveActivity(
  workspaceId: string,
  activityId: string,
): Promise<ActivityRecord | null> {
  await connectDb();
  const document = await ActivityModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: activityId, archivedAt: null }),
    { $set: { archivedAt: new Date() } },
    { new: true },
  ).lean<ActivityDocument>();
  return document ? toActivityRecord(document) : null;
}
