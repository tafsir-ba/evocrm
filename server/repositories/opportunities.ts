import "server-only";

import mongoose from "mongoose";

import { connectDb } from "@/server/db/mongoose";
import { OpportunityModel, type OpportunityDocument } from "@/models/opportunity";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import { toObjectIdString } from "@/server/utils/mongo-id";

function toObjectIdArray(ids: string[]): mongoose.Types.ObjectId[] {
  return ids
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

export type OpportunityRecord = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  leadId: string;
  propertyId: string;
  statusId: string;
  ownerId: string | null;
  assignedTo: string | null;
  value: number | null;
  currency: string;
  probability: number | null;
  expectedCloseDate: Date | null;
  lostReasonId: string | null;
  lostReasonText: string | null;
  closedAt: Date | null;
  wonAt: Date | null;
  lostAt: Date | null;
  notes: string | null;
  tags: string[];
  createdBy: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toOpportunityRecord(document: OpportunityDocument): OpportunityRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    projectId: toObjectIdString(document.projectId),
    leadId: document.leadId.toString(),
    propertyId: document.propertyId.toString(),
    statusId: document.statusId.toString(),
    ownerId: document.ownerId?.toString() ?? null,
    assignedTo: document.assignedTo?.toString() ?? null,
    value: document.value ?? null,
    currency: document.currency,
    probability: document.probability ?? null,
    expectedCloseDate: document.expectedCloseDate ?? null,
    lostReasonId: document.lostReasonId?.toString() ?? null,
    lostReasonText: document.lostReasonText ?? null,
    closedAt: document.closedAt ?? null,
    wonAt: document.wonAt ?? null,
    lostAt: document.lostAt ?? null,
    notes: document.notes ?? null,
    tags: (document.tags ?? []).map((tagId) => tagId.toString()),
    createdBy: document.createdBy.toString(),
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export type OpportunityListFilter = {
  includeArchived?: boolean;
  projectId?: string;
  search?: string;
  searchLeadIds?: string[];
  searchPropertyIds?: string[];
  statusId?: string;
  statusIds?: string[];
  leadId?: string;
  propertyId?: string;
  assignedTo?: string;
  ownerId?: string;
  tagId?: string;
  expectedCloseFrom?: Date;
  expectedCloseTo?: Date;
  createdFrom?: Date;
  createdTo?: Date;
  closedFrom?: Date;
  closedTo?: Date;
  excludeIds?: string[];
  page?: number;
  pageSize?: number;
};

function buildListQuery(filter: OpportunityListFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (!filter.includeArchived) {
    query.archivedAt = null;
  }

  if (filter.projectId) {
    query.projectId = filter.projectId;
  }

  if (filter.statusId) {
    query.statusId = filter.statusId;
  } else if (filter.statusIds !== undefined) {
    query.statusId = { $in: filter.statusIds };
  }

  if (filter.leadId) {
    query.leadId = filter.leadId;
  }
  if (filter.propertyId) {
    query.propertyId = filter.propertyId;
  }
  if (filter.assignedTo) {
    query.assignedTo = filter.assignedTo;
  }
  if (filter.ownerId) {
    query.ownerId = filter.ownerId;
  }
  if (filter.tagId) {
    query.tags = filter.tagId;
  }

  if (filter.expectedCloseFrom || filter.expectedCloseTo) {
    const expectedCloseDate: Record<string, Date> = {};
    if (filter.expectedCloseFrom) {
      expectedCloseDate.$gte = filter.expectedCloseFrom;
    }
    if (filter.expectedCloseTo) {
      expectedCloseDate.$lte = filter.expectedCloseTo;
    }
    query.expectedCloseDate = expectedCloseDate;
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

  if (filter.excludeIds && filter.excludeIds.length > 0) {
    query._id = { $nin: toObjectIdArray(filter.excludeIds) };
  }

  if (filter.closedFrom || filter.closedTo) {
    const closedAt: Record<string, Date> = {};
    if (filter.closedFrom) {
      closedAt.$gte = filter.closedFrom;
    }
    if (filter.closedTo) {
      closedAt.$lte = filter.closedTo;
    }
    query.closedAt = closedAt;
  }

  const orConditions: Record<string, unknown>[] = [];

  if (filter.search) {
    const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    orConditions.push({ notes: regex });
  }

  if (filter.searchLeadIds && filter.searchLeadIds.length > 0) {
    orConditions.push({ leadId: { $in: filter.searchLeadIds } });
  }

  if (filter.searchPropertyIds && filter.searchPropertyIds.length > 0) {
    orConditions.push({ propertyId: { $in: filter.searchPropertyIds } });
  }

  if (orConditions.length === 1) {
    Object.assign(query, orConditions[0]);
  } else if (orConditions.length > 1) {
    query.$or = orConditions;
  }

  return query;
}

export async function findOpportunities(
  workspaceId: string,
  filter: OpportunityListFilter = {},
): Promise<{ opportunities: OpportunityRecord[]; total: number }> {
  await connectDb();

  const query = withWorkspaceScope(workspaceId, buildListQuery(filter));
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const [documents, total] = await Promise.all([
    OpportunityModel.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean<OpportunityDocument[]>(),
    OpportunityModel.countDocuments(query),
  ]);

  return {
    opportunities: documents.map(toOpportunityRecord),
    total,
  };
}

export async function findAllOpportunities(
  workspaceId: string,
  filter: Omit<OpportunityListFilter, "page" | "pageSize"> = {},
): Promise<OpportunityRecord[]> {
  await connectDb();

  const query = withWorkspaceScope(workspaceId, buildListQuery(filter));
  const documents = await OpportunityModel.find(query)
    .sort({ updatedAt: -1 })
    .lean<OpportunityDocument[]>();

  return documents.map(toOpportunityRecord);
}

export async function findOpportunityById(
  workspaceId: string,
  opportunityId: string,
): Promise<OpportunityRecord | null> {
  await connectDb();
  const document = await OpportunityModel.findOne(
    withWorkspaceScope(workspaceId, { _id: opportunityId }),
  ).lean<OpportunityDocument>();
  return document ? toOpportunityRecord(document) : null;
}

export async function createOpportunity(input: {
  workspaceId: string;
  projectId: string;
  leadId: string;
  propertyId: string;
  statusId: string;
  ownerId?: string | null;
  assignedTo?: string | null;
  value?: number | null;
  currency: string;
  probability?: number | null;
  expectedCloseDate?: Date | null;
  lostReasonId?: string | null;
  lostReasonText?: string | null;
  closedAt?: Date | null;
  wonAt?: Date | null;
  lostAt?: Date | null;
  notes?: string | null;
  tags?: string[];
  createdBy: string;
}): Promise<OpportunityRecord> {
  await connectDb();
  const document = await OpportunityModel.create({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    leadId: input.leadId,
    propertyId: input.propertyId,
    statusId: input.statusId,
    ownerId: input.ownerId ?? null,
    assignedTo: input.assignedTo ?? null,
    value: input.value ?? null,
    currency: input.currency,
    probability: input.probability ?? null,
    expectedCloseDate: input.expectedCloseDate ?? null,
    lostReasonId: input.lostReasonId ?? null,
    lostReasonText: input.lostReasonText ?? null,
    closedAt: input.closedAt ?? null,
    wonAt: input.wonAt ?? null,
    lostAt: input.lostAt ?? null,
    notes: input.notes?.trim() || null,
    tags: input.tags ?? [],
    createdBy: input.createdBy,
    archivedAt: null,
  });
  return toOpportunityRecord(document.toObject() as OpportunityDocument);
}

export async function updateOpportunity(
  workspaceId: string,
  opportunityId: string,
  input: Partial<{
    projectId: string;
    leadId: string;
    propertyId: string;
    statusId: string;
    ownerId: string | null;
    assignedTo: string | null;
    value: number | null;
    currency: string;
    probability: number | null;
    expectedCloseDate: Date | null;
    lostReasonId: string | null;
    lostReasonText: string | null;
    closedAt: Date | null;
    wonAt: Date | null;
    lostAt: Date | null;
    notes: string | null;
    tags: string[];
  }>,
): Promise<OpportunityRecord | null> {
  await connectDb();
  const document = await OpportunityModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: opportunityId, archivedAt: null }),
    { $set: input },
    { new: true },
  ).lean<OpportunityDocument>();
  return document ? toOpportunityRecord(document) : null;
}

export async function archiveOpportunity(
  workspaceId: string,
  opportunityId: string,
): Promise<OpportunityRecord | null> {
  await connectDb();
  const document = await OpportunityModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: opportunityId, archivedAt: null }),
    { $set: { archivedAt: new Date() } },
    { new: true },
  ).lean<OpportunityDocument>();
  return document ? toOpportunityRecord(document) : null;
}
