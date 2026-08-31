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
import type { LeadIntelligenceProvenance } from "@/lib/lead-intelligence";
import { withLeadAcquisitionFilter } from "@/lib/inbound-acquisition";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import { toObjectIdString } from "@/server/utils/mongo-id";

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
    projectId: string | null;
    companyId?: string | null;
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
  industry: string | null;
  jobTitle: string | null;
  stateRegion: string | null;
  intelligenceProvenance: LeadIntelligenceProvenance;
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
    projectId: toObjectIdString(document.projectId),
    companyId: toObjectIdString(
      (document as LeadDocument & { companyId?: mongoose.Types.ObjectId | null }).companyId,
    ),
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
    industry: document.industry ?? null,
    jobTitle: document.jobTitle ?? null,
    stateRegion: document.stateRegion ?? null,
    intelligenceProvenance:
      ((document as LeadDocument & { intelligenceProvenance?: LeadIntelligenceProvenance })
        .intelligenceProvenance as LeadIntelligenceProvenance | undefined) ?? {},
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
  companyId?: string;
  includeAssociated?: boolean;
  associatedLeadIds?: string[];
  search?: string;
  statusId?: string;
  sourceId?: string;
  assignedTo?: string;
  ownerId?: string;
  tagId?: string;
  propertyTypeInterest?: PropertyTypeInterest;
  transactionIntent?: TransactionIntent;
  usagePurpose?: UsagePurpose;
  industry?: string;
  jobTitle?: string;
  stateRegion?: string;
  integrationId?: string;
  utmCampaign?: string;
  createdFrom?: Date;
  createdTo?: Date;
  acquisition?: "genuine_inbound" | "legacy_import";
  excludeIds?: string[];
  leadIds?: string[];
  page?: number;
  pageSize?: number;
};

function buildListQuery(filter: LeadListFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (!filter.includeArchived) {
    query.archivedAt = null;
  }

  const projectScope = buildProjectScope(filter);
  if (projectScope.projectId) {
    query.projectId = projectScope.projectId;
  }
  if (filter.companyId) {
    query.companyId = filter.companyId;
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
  if (filter.industry?.trim()) {
    query.industry = new RegExp(
      filter.industry.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
  }
  if (filter.jobTitle?.trim()) {
    query.jobTitle = new RegExp(
      filter.jobTitle.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
  }
  if (filter.stateRegion?.trim()) {
    query.stateRegion = new RegExp(
      filter.stateRegion.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
  }
  if (filter.integrationId) {
    query["attributes.integration.integrationId"] = filter.integrationId;
  }
  if (filter.utmCampaign?.trim()) {
    query["attributes.integration.utm.campaign"] = filter.utmCampaign.trim();
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

  if (filter.leadIds) {
    const leadObjectIds = toObjectIdArray(filter.leadIds);
    if (filter.excludeIds && filter.excludeIds.length > 0) {
      const excluded = new Set(filter.excludeIds);
      query._id = {
        $in: leadObjectIds.filter((id) => !excluded.has(id.toString())),
      };
    } else {
      query._id = { $in: leadObjectIds };
    }
  } else if (filter.excludeIds && filter.excludeIds.length > 0) {
    query._id = { $nin: toObjectIdArray(filter.excludeIds) };
  }

  const searchOr = buildSearchOr(filter.search);
  const associatedOr = projectScope.$or;
  if (associatedOr && searchOr) {
    query.$and = [{ $or: associatedOr }, { $or: searchOr }];
  } else if (associatedOr) {
    query.$or = associatedOr;
  } else if (searchOr) {
    query.$or = searchOr;
  }

  return withLeadAcquisitionFilter(query, filter.acquisition);
}

function buildProjectScope(filter: LeadListFilter): {
  projectId?: string;
  $or?: Array<Record<string, unknown>>;
} {
  if (!filter.projectId) {
    return {};
  }

  if (!filter.includeAssociated) {
    return { projectId: filter.projectId };
  }

  const associatedIds = toObjectIdArray(filter.associatedLeadIds ?? []);
  const clauses: Array<Record<string, unknown>> = [{ projectId: filter.projectId }];
  if (associatedIds.length > 0) {
    clauses.push({ _id: { $in: associatedIds } });
  }
  return { $or: clauses };
}

function buildSearchOr(search: string | undefined): Array<Record<string, unknown>> | null {
  if (!search) {
    return null;
  }
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");
  return [
    { firstName: regex },
    { lastName: regex },
    { fullName: regex },
    { email: regex },
    { phone: regex },
    { industry: regex },
    { jobTitle: regex },
    { stateRegion: regex },
  ];
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

export async function findLeadIds(
  workspaceId: string,
  filter: LeadListFilter = {},
): Promise<string[]> {
  await connectDb();
  const query = withWorkspaceScope(workspaceId, buildListQuery(filter));
  const documents = await LeadModel.find(query).select({ _id: 1 }).lean<Array<{ _id: mongoose.Types.ObjectId }>>();

  return documents.map((document) => document._id.toString());
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

export async function findLeadsByIds(
  workspaceId: string,
  leadIds: string[],
): Promise<LeadRecord[]> {
  if (leadIds.length === 0) {
    return [];
  }

  await connectDb();

  const documents = await LeadModel.find(
    withWorkspaceScope(workspaceId, { _id: { $in: leadIds } }),
  ).lean();

  return documents.map((document) => toLeadRecord(document as LeadDocument));
}

export async function findLeadsByCompanyIds(
  workspaceId: string,
  companyIds: string[],
  options: { limit?: number } = {},
): Promise<LeadRecord[]> {
  const ids = [...new Set(companyIds.filter((id) => mongoose.isValidObjectId(id)))];
  if (ids.length === 0) {
    return [];
  }

  await connectDb();
  const documents = await LeadModel.find(
    withWorkspaceScope(workspaceId, {
      companyId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
      archivedAt: null,
    }),
  )
    .sort({ fullName: 1 })
    .limit(options.limit ?? 50)
    .lean<LeadDocument[]>();

  return documents.map(toLeadRecord);
}

export async function findLeadsWithHubSpotContactIdempotency(
  workspaceId: string,
  options: { includeArchived?: boolean } = {},
): Promise<LeadRecord[]> {
  await connectDb();

  const documents = await LeadModel.find(
    withWorkspaceScope(workspaceId, {
      ...(options.includeArchived ? {} : { archivedAt: null }),
      "attributes.integration.idempotencyKey": { $regex: /^hubspot:contact:/ },
    }),
  )
    .sort({ createdAt: 1 })
    .lean<LeadDocument[]>();

  return documents.map(toLeadRecord);
}

export type PilotDedupeLead = {
  id: string;
  projectId: string | null;
  emailNormalized: string | null;
  firstName: string;
  lastName: string;
  attributes: Record<string, unknown>;
};

export async function findLeadsForHubSpotGvPilotDedupe(input: {
  workspaceId: string;
  projectId: string;
  emailNormalizedValues: string[];
  hubspotContactIds: string[];
}): Promise<PilotDedupeLead[]> {
  await connectDb();

  const emails = [...new Set(input.emailNormalizedValues.filter(Boolean))];
  const contactIds = [...new Set(input.hubspotContactIds.filter(Boolean))];
  const idempotencyKeys = contactIds.map((id) => `hubspot:contact:${id}`);

  const orClauses: Record<string, unknown>[] = [];
  if (emails.length > 0) {
    orClauses.push({
      projectId: input.projectId,
      emailNormalized: { $in: emails },
    });
  }
  if (idempotencyKeys.length > 0) {
    orClauses.push({
      "attributes.integration.idempotencyKey": { $in: idempotencyKeys },
    });
  }
  if (contactIds.length > 0) {
    orClauses.push({
      "attributes.integration.externalId": { $in: contactIds },
    });
  }

  if (orClauses.length === 0) {
    return [];
  }

  const documents = await LeadModel.find(
    withWorkspaceScope(input.workspaceId, {
      archivedAt: null,
      $or: orClauses,
    }),
  )
    .select({
      projectId: 1,
      emailNormalized: 1,
      firstName: 1,
      lastName: 1,
      attributes: 1,
    })
    .lean<
      Array<{
        _id: mongoose.Types.ObjectId;
        projectId?: unknown;
        emailNormalized?: string | null;
        firstName?: string;
        lastName?: string;
        attributes?: Record<string, unknown>;
      }>
    >();

  return documents.map((document) => ({
    id: document._id.toString(),
    projectId: document.projectId ? String(document.projectId) : null,
    emailNormalized: document.emailNormalized ?? null,
    firstName: document.firstName ?? "",
    lastName: document.lastName ?? "",
    attributes: document.attributes ?? {},
  }));
}

export async function countActiveLeadsForProject(
  workspaceId: string,
  projectId: string,
): Promise<number> {
  await connectDb();
  return LeadModel.countDocuments(
    withWorkspaceScope(workspaceId, {
      projectId,
      archivedAt: null,
    }),
  );
}

export async function findActiveLeadsByEmailNormalized(
  workspaceId: string,
  emailNormalizedValues: string[],
): Promise<Set<string>> {
  await connectDb();

  const uniqueEmails = [...new Set(emailNormalizedValues.filter(Boolean))];

  if (uniqueEmails.length === 0) {
    return new Set();
  }

  const documents = await LeadModel.find(
    withWorkspaceScope(workspaceId, {
      emailNormalized: { $in: uniqueEmails },
      archivedAt: null,
    }),
  )
    .select({ emailNormalized: 1, projectId: 1 })
    .lean<Array<{ emailNormalized?: string | null; projectId?: unknown }>>();

  return new Set(
    documents
      .map((document) => {
        const email = document.emailNormalized;
        const projectId = document.projectId ? String(document.projectId) : null;
        if (!email || !projectId) {
          return null;
        }
        return buildLeadEmailProjectKey(projectId, email);
      })
      .filter((key): key is string => Boolean(key)),
  );
}

export function buildLeadEmailProjectKey(projectId: string, emailNormalized: string): string {
  return `${projectId}::${emailNormalized}`;
}

export async function findActiveLeadByEmailNormalized(
  workspaceId: string,
  emailNormalized: string,
  excludeLeadId?: string,
  projectId?: string,
): Promise<LeadRecord | null> {
  await connectDb();
  const query: Record<string, unknown> = {
    emailNormalized,
    archivedAt: null,
  };
  if (excludeLeadId) {
    query._id = { $ne: excludeLeadId };
  }
  if (projectId) {
    query.projectId = projectId;
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

export async function findLeadByHubSpotContactId(
  workspaceId: string,
  contactId: string,
): Promise<LeadRecord | null> {
  await connectDb();
  const trimmed = contactId.trim();
  if (!trimmed) {
    return null;
  }
  const document = await LeadModel.findOne(
    withWorkspaceScope(workspaceId, {
      archivedAt: null,
      $or: [
        { "attributes.integration.idempotencyKey": `hubspot:contact:${trimmed}` },
        { "attributes.integration.externalId": trimmed },
      ],
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
  createdAt?: Date;
  companyId?: string | null;
  industry?: string | null;
  jobTitle?: string | null;
  stateRegion?: string | null;
  intelligenceProvenance?: LeadIntelligenceProvenance;
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
      industry: input.industry ?? null,
      jobTitle: input.jobTitle ?? null,
      stateRegion: input.stateRegion ?? null,
      intelligenceProvenance: input.intelligenceProvenance ?? {},
      notes: input.notes ?? null,
      tags: input.tags ?? [],
      attributes: input.attributes ?? {},
      emailConsentStatus: input.emailConsentStatus ?? "unknown",
      createdBy: input.createdBy,
      companyId: input.companyId ?? null,
      archivedAt: null,
      ...(input.createdAt
        ? { createdAt: input.createdAt, updatedAt: input.createdAt }
        : {}),
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
    industry: string | null;
    jobTitle: string | null;
    stateRegion: string | null;
    intelligenceProvenance: LeadIntelligenceProvenance;
    notes: string | null;
    tags: string[];
    attributes: Record<string, unknown>;
    emailConsentStatus: string;
    emailUnsubscribedAt: Date | null;
    emailUnsubscribeReason: string | null;
    companyId: string | null;
    projectId: string;
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

export async function restoreLead(
  workspaceId: string,
  leadId: string,
): Promise<LeadRecord | null> {
  await connectDb();
  try {
    const document = await LeadModel.findOneAndUpdate(
      withWorkspaceScope(workspaceId, {
        _id: leadId,
        archivedAt: { $ne: null },
      }),
      { $set: { archivedAt: null } },
      { new: true },
    ).lean<LeadDocument>();
    return document ? toLeadRecord(document) : null;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "CONFLICT",
        "A lead with this email already exists in this project.",
      );
    }
    throw error;
  }
}
