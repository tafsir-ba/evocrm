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

export type CampaignAudienceSummary = {
  queued: number;
  excludedMissingEmail: number;
  excludedUnsubscribed: number;
  excludedSuppressed: number;
  excludedInvalid: number;
  excludedArchived: number;
  unknownConsent: number;
  deduped: number;
};

export type CampaignRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  kind: "drip" | "newsletter";
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
  scheduledFor: Date | null;
  audienceLockedAt: Date | null;
  audienceSummary: CampaignAudienceSummary | null;
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

function toAudienceSummary(
  document: CampaignDocument,
): CampaignAudienceSummary | null {
  const summary = document.audienceSummary as CampaignAudienceSummary | null | undefined;
  if (!summary) {
    return null;
  }

  return {
    queued: summary.queued ?? 0,
    excludedMissingEmail: summary.excludedMissingEmail ?? 0,
    excludedUnsubscribed: summary.excludedUnsubscribed ?? 0,
    excludedSuppressed: summary.excludedSuppressed ?? 0,
    excludedInvalid: summary.excludedInvalid ?? 0,
    excludedArchived: summary.excludedArchived ?? 0,
    unknownConsent: summary.unknownConsent ?? 0,
    deduped: summary.deduped ?? 0,
  };
}

function toCampaignRecord(document: CampaignDocument): CampaignRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    name: document.name,
    status: document.status as CampaignRecord["status"],
    kind: (document.kind as CampaignRecord["kind"] | undefined) ?? "drip",
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
    scheduledFor: document.scheduledFor ?? null,
    audienceLockedAt: document.audienceLockedAt ?? null,
    audienceSummary: toAudienceSummary(document),
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
  kind?: CampaignRecord["kind"];
  audienceType?: CampaignRecord["audienceType"];
  projectId?: string;
  projectIds?: string[];
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

  if (filter.kind) {
    if (filter.kind === "drip") {
      // Back-compat: legacy rows without kind are drips.
      query.kind = { $nin: ["newsletter"] };
    } else {
      query.kind = filter.kind;
    }
  }

  if (filter.audienceType) {
    query.audienceType = filter.audienceType;
  }

  if (filter.projectId) {
    query.projectIds = filter.projectId;
  } else if (filter.projectIds !== undefined) {
    // Empty allowlist means no accessible projects — match nothing.
    if (filter.projectIds.length === 0) {
      query._id = { $exists: false };
    } else {
      query.projectIds = { $in: filter.projectIds };
    }
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
      // Newsletters are snapshot/manual-only; never auto-enroll into them.
      // Legacy drip rows without `kind` remain eligible via $nin.
      kind: { $nin: ["newsletter"] },
      ...(filter.trigger === "new_lead"
        ? {
            // Include legacy rows saved before trigger normalization (auto on + manual_only).
            enrollmentTrigger: { $in: ["new_lead", "manual_only"] },
          }
        : { enrollmentTrigger: filter.trigger }),
    }),
  )
    .sort({ createdAt: 1 })
    .lean<CampaignDocument[]>();

  return documents.map(toCampaignRecord);
}

export type CreateCampaignInput = {
  name: string;
  kind?: CampaignRecord["kind"];
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

  const kind = input.kind ?? "drip";
  const isNewsletter = kind === "newsletter";

  const document = await CampaignModel.create({
    workspaceId,
    name: input.name.trim(),
    status: "draft",
    kind,
    audienceType: input.audienceType,
    projectIds: input.projectIds ?? [],
    autoEnrollmentEnabled: isNewsletter
      ? false
      : (input.autoEnrollmentEnabled ?? false),
    enrollmentTrigger: isNewsletter
      ? "manual_only"
      : (input.enrollmentTrigger ?? "manual_only"),
    enrollmentRules: input.enrollmentRules ?? { logic: "AND", conditions: [] },
    frequency: input.frequency ?? null,
    defaultFromName: input.defaultFromName?.trim() ?? input.senderName?.trim() ?? null,
    senderName: input.senderName?.trim() ?? input.defaultFromName?.trim() ?? null,
    senderEmail: input.senderEmail?.trim().toLowerCase() ?? null,
    sendingDomainId: input.sendingDomainId ?? null,
    scheduledFor: null,
    audienceLockedAt: null,
    audienceSummary: null,
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
    scheduledFor: Date | null;
    audienceLockedAt: Date | null;
    audienceSummary: CampaignAudienceSummary | null;
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
