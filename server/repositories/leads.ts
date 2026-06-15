import "server-only";

import mongoose from "mongoose";

import { connectDb } from "@/server/db/mongoose";
import { AppError } from "@/server/errors";
import { LeadModel, type LeadDocument } from "@/models/lead";
import type {
  PropertyTypeInterest,
  TransactionIntent,
  UsagePurpose,
} from "@/lib/lead-preferences";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

function toObjectIdArray(ids: string[]): mongoose.Types.ObjectId[] {
  return ids
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: number }).code === 11000
  );
}

export type LeadRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  statusId: string;
  sourceId: string | null;
  ownerId: string | null;
  assignedTo: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  emailNormalized: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  language: string | null;
  preferredContactMethod: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  preferredAreas: string[];
  propertyTypeInterests: PropertyTypeInterest[];
  transactionIntent: TransactionIntent | null;
  usagePurpose: UsagePurpose | null;
  notes: string | null;
  tags: string[];
  attributes: Record<string, unknown>;
  emailConsentStatus: string;
  emailUnsubscribedAt: Date | null;
  emailUnsubscribeReason: string | null;
  lastContactedAt: Date | null;
  createdBy: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toLeadRecord(document: LeadDocument): LeadRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    projectId: document.projectId.toString(),
    statusId: document.statusId.toString(),
    sourceId: document.sourceId?.toString() ?? null,
    ownerId: document.ownerId?.toString() ?? null,
    assignedTo: document.assignedTo?.toString() ?? null,
    firstName: document.firstName,
    lastName: document.lastName,
    fullName: document.fullName,
    email: document.email ?? null,
    emailNormalized: document.emailNormalized ?? null,
    phone: document.phone ?? null,
    phoneNormalized: document.phoneNormalized ?? null,
    language: document.language ?? null,
    preferredContactMethod: document.preferredContactMethod ?? null,
    budgetMin: document.budgetMin ?? null,
    budgetMax: document.budgetMax ?? null,
    preferredAreas: document.preferredAreas ?? [],
    propertyTypeInterests: (document.propertyTypeInterests ??
      []) as PropertyTypeInterest[],
    transactionIntent: (document.transactionIntent as TransactionIntent | null) ?? null,
    usagePurpose: (document.usagePurpose as UsagePurpose | null) ?? null,
    notes: document.notes ?? null,
    tags: (document.tags ?? []).map((tagId) => tagId.toString()),
    attributes: (document.attributes as Record<string, unknown>) ?? {},
    emailConsentStatus: document.emailConsentStatus ?? "unknown",
    emailUnsubscribedAt: document.emailUnsubscribedAt ?? null,
    emailUnsubscribeReason: document.emailUnsubscribeReason ?? null,
    lastContactedAt: document.lastContactedAt ?? null,
    createdBy: document.createdBy.toString(),
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export type LeadListFilter = {
  includeArchived?: boolean;
  projectId?: string;
  search?: string;
  statusId?: string;
  sourceId?: string;
  assignedTo?: string;
  ownerId?: string;
  tagId?: string;
  propertyTypeInterest?: PropertyTypeInterest;
  transactionIntent?: TransactionIntent;
  usagePurpose?: UsagePurpose;
  createdFrom?: Date;
  createdTo?: Date;
  excludeIds?: string[];
  page?: number;
  pageSize?: number;
};

function buildListQuery(filter: LeadListFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (!filter.includeArchived) {
    query.archivedAt = null;
  }

  if (filter.projectId) {
    query.projectId = filter.projectId;
  }

  if (filter.statusId) {
    query.statusId = filter.statusId;
  }
  if (filter.sourceId) {
    query.sourceId = filter.sourceId;
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
  if (filter.propertyTypeInterest) {
    query.propertyTypeInterests = filter.propertyTypeInterest;
  }
  if (filter.transactionIntent) {
    query.transactionIntent = filter.transactionIntent;
  }
  if (filter.usagePurpose) {
    query.usagePurpose = filter.usagePurpose;
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

  if (filter.search) {
    const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    query.$or = [
      { firstName: regex },
      { lastName: regex },
      { fullName: regex },
      { email: regex },
      { phone: regex },
    ];
  }

  return query;
}

export async function findLeads(
  workspaceId: string,
  filter: LeadListFilter = {},
): Promise<{ leads: LeadRecord[]; total: number }> {
  await connectDb();
  const query = withWorkspaceScope(workspaceId, buildListQuery(filter));
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const [documents, total] = await Promise.all([
    LeadModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean<LeadDocument[]>(),
    LeadModel.countDocuments(query),
  ]);

  return {
    leads: documents.map(toLeadRecord),
    total,
  };
}

export async function findLeadById(
  workspaceId: string,
  leadId: string,
): Promise<LeadRecord | null> {
  await connectDb();
  const document = await LeadModel.findOne(
    withWorkspaceScope(workspaceId, { _id: leadId }),
  ).lean<LeadDocument>();
  return document ? toLeadRecord(document) : null;
}

export async function findActiveLeadByEmailNormalized(
  workspaceId: string,
  emailNormalized: string,
  excludeLeadId?: string,
): Promise<LeadRecord | null> {
  await connectDb();
  const query: Record<string, unknown> = {
    emailNormalized,
    archivedAt: null,
  };
  if (excludeLeadId) {
    query._id = { $ne: excludeLeadId };
  }

  const document = await LeadModel.findOne(
    withWorkspaceScope(workspaceId, query),
  ).lean<LeadDocument>();
  return document ? toLeadRecord(document) : null;
}

export async function findLeadByIntegrationIdempotencyKey(
  workspaceId: string,
  integrationId: string,
  idempotencyKey: string,
): Promise<LeadRecord | null> {
  await connectDb();
  const document = await LeadModel.findOne(
    withWorkspaceScope(workspaceId, {
      archivedAt: null,
      "attributes.integration.integrationId": integrationId,
      "attributes.integration.idempotencyKey": idempotencyKey,
    }),
  ).lean<LeadDocument>();

  return document ? toLeadRecord(document) : null;
}

export async function findLeadByPhoneNormalized(
  workspaceId: string,
  phoneNormalized: string,
  excludeLeadId?: string,
): Promise<LeadRecord | null> {
  await connectDb();
  const query: Record<string, unknown> = {
    phoneNormalized,
    archivedAt: null,
  };
  if (excludeLeadId) {
    query._id = { $ne: excludeLeadId };
  }

  const document = await LeadModel.findOne(
    withWorkspaceScope(workspaceId, query),
  ).lean<LeadDocument>();
  return document ? toLeadRecord(document) : null;
}

export async function createLead(input: {
  workspaceId: string;
  projectId: string;
  statusId: string;
  sourceId?: string | null;
  ownerId?: string | null;
  assignedTo?: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string | null;
  emailNormalized?: string | null;
  phone?: string | null;
  phoneNormalized?: string | null;
  language?: string | null;
  preferredContactMethod?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  preferredAreas?: string[];
  propertyTypeInterests?: PropertyTypeInterest[];
  transactionIntent?: TransactionIntent | null;
  usagePurpose?: UsagePurpose | null;
  notes?: string | null;
  tags?: string[];
  attributes?: Record<string, unknown>;
  emailConsentStatus?: string;
  createdBy: string;
}): Promise<LeadRecord> {
  await connectDb();
  try {
    const document = await LeadModel.create({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      statusId: input.statusId,
      sourceId: input.sourceId ?? null,
      ownerId: input.ownerId ?? null,
      assignedTo: input.assignedTo ?? null,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      fullName: input.fullName,
      email: input.email ?? null,
      emailNormalized: input.emailNormalized ?? null,
      phone: input.phone ?? null,
      phoneNormalized: input.phoneNormalized ?? null,
      language: input.language ?? null,
      preferredContactMethod: input.preferredContactMethod ?? null,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      preferredAreas: input.preferredAreas ?? [],
      propertyTypeInterests: input.propertyTypeInterests ?? [],
      transactionIntent: input.transactionIntent ?? null,
      usagePurpose: input.usagePurpose ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
      attributes: input.attributes ?? {},
      emailConsentStatus: input.emailConsentStatus ?? "unknown",
      createdBy: input.createdBy,
      archivedAt: null,
    });
    return toLeadRecord(document.toObject() as LeadDocument);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "CONFLICT",
        "A lead with this email already exists in this workspace.",
      );
    }

    throw error;
  }
}

export async function updateLead(
  workspaceId: string,
  leadId: string,
  input: Partial<{
    statusId: string;
    sourceId: string | null;
    ownerId: string | null;
    assignedTo: string | null;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string | null;
    emailNormalized: string | null;
    phone: string | null;
    phoneNormalized: string | null;
    language: string | null;
    preferredContactMethod: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    preferredAreas: string[];
    propertyTypeInterests: PropertyTypeInterest[];
    transactionIntent: TransactionIntent | null;
    usagePurpose: UsagePurpose | null;
    notes: string | null;
    tags: string[];
    attributes: Record<string, unknown>;
    emailConsentStatus: string;
    emailUnsubscribedAt: Date | null;
    emailUnsubscribeReason: string | null;
  }>,
): Promise<LeadRecord | null> {
  await connectDb();
  const document = await LeadModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: leadId, archivedAt: null }),
    { $set: input },
    { new: true },
  ).lean<LeadDocument>();
  return document ? toLeadRecord(document) : null;
}

export async function archiveLead(
  workspaceId: string,
  leadId: string,
): Promise<LeadRecord | null> {
  await connectDb();
  const document = await LeadModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: leadId, archivedAt: null }),
    { $set: { archivedAt: new Date() } },
    { new: true },
  ).lean<LeadDocument>();
  return document ? toLeadRecord(document) : null;
}
