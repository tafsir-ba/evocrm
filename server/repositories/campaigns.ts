import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { CampaignModel, type CampaignDocument } from "@/models/campaign";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type EnrollmentCondition = {
  field:
    | "projectId"
    | "tags"
    | "sourceId"
    | "statusId"
    | "assignedTo"
    | "customField";
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "is_empty"
    | "is_not_empty";
  value: string | string[] | boolean | number | null;
  /** Lead attribute key when field is `customField`. */
  customFieldKey?: string | null;
};

export type EnrollmentRules = {
  logic: "AND" | "OR";
  conditions: EnrollmentCondition[];
};

export type CampaignRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  audienceType: "leads" | "opportunities";
  projectIds: string[];
  autoEnrollmentEnabled: boolean;
  enrollmentTrigger: "new_lead" | "lead_updated" | "manual_only";
  enrollmentRules: EnrollmentRules;
  frequency: string | null;
  defaultFromName: string | null;
  senderName: string | null;
  senderEmail: string | null;
  sendingDomainId: string | null;
  createdBy: string;
  ownerId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toEnrollmentRules(document: CampaignDocument): EnrollmentRules {
  const rules = document.enrollmentRules as EnrollmentRules | undefined;
  return {
    logic: rules?.logic ?? "AND",
    conditions: rules?.conditions ?? [],
  };
}

function toCampaignRecord(document: CampaignDocument): CampaignRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    name: document.name,
    status: document.status as CampaignRecord["status"],
    audienceType: document.audienceType as CampaignRecord["audienceType"],
    projectIds: (document.projectIds ?? []).map((id) => id.toString()),
    autoEnrollmentEnabled: document.autoEnrollmentEnabled ?? false,
    enrollmentTrigger:
      (document.enrollmentTrigger as CampaignRecord["enrollmentTrigger"]) ??
      "manual_only",
    enrollmentRules: toEnrollmentRules(document),
    frequency: document.frequency ?? null,
    defaultFromName: document.defaultFromName ?? null,
    senderName: document.senderName ?? document.defaultFromName ?? null,
    senderEmail: document.senderEmail ?? null,
    sendingDomainId: document.sendingDomainId?.toString() ?? null,
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
  projectId?: string;
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

  if (filter.projectId) {
    query.$or = [
      { projectIds: { $size: 0 } },
      { projectIds: filter.projectId },
    ];
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

export async function findActiveAutoEnrollmentCampaigns(
  workspaceId: string,
  filter: {
    audienceType: CampaignRecord["audienceType"];
    trigger: CampaignRecord["enrollmentTrigger"];
  },
): Promise<CampaignRecord[]> {
  await connectDb();

  const documents = await CampaignModel.find(
    withWorkspaceScope(workspaceId, {
      status: "active",
      archivedAt: null,
      audienceType: filter.audienceType,
      autoEnrollmentEnabled: true,
      enrollmentTrigger: filter.trigger,
    }),
  )
    .sort({ createdAt: 1 })
    .lean<CampaignDocument[]>();

  return documents.map(toCampaignRecord);
}

export type CreateCampaignInput = {
  name: string;
  audienceType: CampaignRecord["audienceType"];
  projectIds?: string[];
  autoEnrollmentEnabled?: boolean;
  enrollmentTrigger?: CampaignRecord["enrollmentTrigger"];
  enrollmentRules?: EnrollmentRules;
  frequency?: string | null;
  defaultFromName?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  sendingDomainId?: string | null;
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
    projectIds: input.projectIds ?? [],
    autoEnrollmentEnabled: input.autoEnrollmentEnabled ?? false,
    enrollmentTrigger: input.enrollmentTrigger ?? "manual_only",
    enrollmentRules: input.enrollmentRules ?? { logic: "AND", conditions: [] },
    frequency: input.frequency ?? null,
    defaultFromName: input.defaultFromName?.trim() ?? input.senderName?.trim() ?? null,
    senderName: input.senderName?.trim() ?? input.defaultFromName?.trim() ?? null,
    senderEmail: input.senderEmail?.trim().toLowerCase() ?? null,
    sendingDomainId: input.sendingDomainId ?? null,
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
    projectIds: string[];
    autoEnrollmentEnabled: boolean;
    enrollmentTrigger: CampaignRecord["enrollmentTrigger"];
    enrollmentRules: EnrollmentRules;
    frequency: string | null;
    defaultFromName: string | null;
    senderName: string | null;
    senderEmail: string | null;
    sendingDomainId: string | null;
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

export async function restoreCampaign(
  workspaceId: string,
  campaignId: string,
): Promise<CampaignRecord | null> {
  await connectDb();

  const document = await CampaignModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: campaignId, status: "archived" }),
    {
      $set: {
        status: "draft",
        archivedAt: null,
      },
    },
    { new: true },
  ).lean();

  return document ? toCampaignRecord(document as CampaignDocument) : null;
}

export async function deleteCampaignById(
  workspaceId: string,
  campaignId: string,
): Promise<boolean> {
  await connectDb();

  const result = await CampaignModel.deleteOne(
    withWorkspaceScope(workspaceId, { _id: campaignId }),
  );

  return result.deletedCount > 0;
}

export async function countCampaignsBySendingDomainId(
  workspaceId: string,
  sendingDomainId: string,
): Promise<number> {
  await connectDb();

  return CampaignModel.countDocuments(
    withWorkspaceScope(workspaceId, {
      sendingDomainId,
      archivedAt: null,
    }),
  );
}
