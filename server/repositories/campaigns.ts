import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { CampaignModel, type CampaignDocument } from "@/models/campaign";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type CampaignRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  audienceType: "leads" | "opportunities";
  frequency: string | null;
  createdBy: string;
  ownerId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toCampaignRecord(document: CampaignDocument): CampaignRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    name: document.name,
    status: document.status as CampaignRecord["status"],
    audienceType: document.audienceType as CampaignRecord["audienceType"],
    frequency: document.frequency ?? null,
    createdBy: document.createdBy.toString(),
    ownerId: document.ownerId?.toString() ?? null,
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export type CampaignListFilter = {
  includeArchived?: boolean;
  status?: CampaignRecord["status"];
  audienceType?: CampaignRecord["audienceType"];
  search?: string;
  page?: number;
  pageSize?: number;
};

function buildListQuery(filter: CampaignListFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (!filter.includeArchived) {
    query.status = { $ne: "archived" };
    query.archivedAt = null;
  }

  if (filter.status) {
    query.status = filter.status;
  }

  if (filter.audienceType) {
    query.audienceType = filter.audienceType;
  }

  if (filter.search) {
    query.name = { $regex: filter.search, $options: "i" };
  }

  return query;
}

export async function findCampaigns(
  workspaceId: string,
  filter: CampaignListFilter = {},
): Promise<{ campaigns: CampaignRecord[]; total: number }> {
  await connectDb();

  const query = withWorkspaceScope(workspaceId, buildListQuery(filter));
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const [campaigns, total] = await Promise.all([
    CampaignModel.find(query).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).lean(),
    CampaignModel.countDocuments(query),
  ]);

  return {
    campaigns: campaigns.map((doc) => toCampaignRecord(doc as CampaignDocument)),
    total,
  };
}

export async function findCampaignById(
  workspaceId: string,
  campaignId: string,
): Promise<CampaignRecord | null> {
  await connectDb();

  const document = await CampaignModel.findOne(
    withWorkspaceScope(workspaceId, { _id: campaignId }),
  ).lean();

  return document ? toCampaignRecord(document as CampaignDocument) : null;
}

export type CreateCampaignInput = {
  name: string;
  audienceType: CampaignRecord["audienceType"];
  frequency?: string | null;
  createdBy: string;
  ownerId?: string | null;
};

export async function createCampaign(
  workspaceId: string,
  input: CreateCampaignInput,
): Promise<CampaignRecord> {
  await connectDb();

  const document = await CampaignModel.create({
    workspaceId,
    name: input.name.trim(),
    status: "draft",
    audienceType: input.audienceType,
    frequency: input.frequency ?? null,
    createdBy: input.createdBy,
    ownerId: input.ownerId ?? null,
    archivedAt: null,
  });

  return toCampaignRecord(document.toObject() as CampaignDocument);
}

export async function updateCampaign(
  workspaceId: string,
  campaignId: string,
  input: Partial<{
    name: string;
    status: CampaignRecord["status"];
    frequency: string | null;
    ownerId: string | null;
    archivedAt: Date | null;
  }>,
): Promise<CampaignRecord | null> {
  await connectDb();

  const document = await CampaignModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: campaignId, archivedAt: null }),
    { $set: input },
    { new: true },
  ).lean();

  return document ? toCampaignRecord(document as CampaignDocument) : null;
}

export async function archiveCampaign(
  workspaceId: string,
  campaignId: string,
): Promise<CampaignRecord | null> {
  await connectDb();

  const document = await CampaignModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: campaignId, archivedAt: null }),
    {
      $set: {
        status: "archived",
        archivedAt: new Date(),
      },
    },
    { new: true },
  ).lean();

  return document ? toCampaignRecord(document as CampaignDocument) : null;
}
