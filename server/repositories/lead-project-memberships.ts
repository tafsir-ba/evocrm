import "server-only";

import mongoose from "mongoose";

import {
  LeadProjectMembershipModel,
  type LeadProjectMembershipDocument,
} from "@/models/lead-project-membership";
import type {
  LeadProjectMembershipProvenance,
  LeadProjectMembershipSource,
} from "@/lib/lead-project-membership";
import { AppError } from "@/server/errors";
import { connectDb } from "@/server/db/mongoose";
import { toObjectIdString } from "@/server/utils/mongo-id";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: number }).code === 11000
  );
}

export type LeadProjectMembershipRecord = {
  id: string;
  workspaceId: string;
  leadId: string;
  projectId: string;
  isPrimary: boolean;
  joinedAt: Date;
  sourceOrder: number;
  source: LeadProjectMembershipSource;
  provenance: LeadProjectMembershipProvenance | null;
  createdBy: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toMembershipRecord(
  document: LeadProjectMembershipDocument,
): LeadProjectMembershipRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    leadId: document.leadId.toString(),
    projectId: toObjectIdString(document.projectId) ?? "",
    isPrimary: document.isPrimary === true,
    joinedAt: document.joinedAt,
    sourceOrder: document.sourceOrder ?? 0,
    source: document.source as LeadProjectMembershipSource,
    provenance: (document.provenance as LeadProjectMembershipProvenance | null) ?? null,
    createdBy: document.createdBy?.toString() ?? null,
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findMembershipsForLead(
  workspaceId: string,
  leadId: string,
  options: { includeArchived?: boolean } = {},
): Promise<LeadProjectMembershipRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = { leadId };
  if (!options.includeArchived) {
    query.archivedAt = null;
  }

  const documents = await LeadProjectMembershipModel.find(
    withWorkspaceScope(workspaceId, query),
  )
    .sort({ isPrimary: -1, sourceOrder: 1, joinedAt: 1 })
    .lean<LeadProjectMembershipDocument[]>();

  return documents.map(toMembershipRecord);
}

export async function findMembershipsForLeadIds(
  workspaceId: string,
  leadIds: string[],
): Promise<Map<string, LeadProjectMembershipRecord[]>> {
  const grouped = new Map<string, LeadProjectMembershipRecord[]>();
  if (leadIds.length === 0) {
    return grouped;
  }

  await connectDb();
  const documents = await LeadProjectMembershipModel.find(
    withWorkspaceScope(workspaceId, {
      leadId: { $in: leadIds },
      archivedAt: null,
    }),
  )
    .sort({ isPrimary: -1, sourceOrder: 1, joinedAt: 1 })
    .lean<LeadProjectMembershipDocument[]>();

  for (const document of documents) {
    const record = toMembershipRecord(document);
    const current = grouped.get(record.leadId) ?? [];
    current.push(record);
    grouped.set(record.leadId, current);
  }

  return grouped;
}

export async function findLeadIdsForProjectMembership(
  workspaceId: string,
  projectId: string,
): Promise<string[]> {
  await connectDb();
  const documents = await LeadProjectMembershipModel.find(
    withWorkspaceScope(workspaceId, {
      projectId,
      archivedAt: null,
    }),
  )
    .select({ leadId: 1 })
    .lean<Array<{ leadId: mongoose.Types.ObjectId }>>();

  return [...new Set(documents.map((document) => document.leadId.toString()))];
}

export async function findMembershipById(
  workspaceId: string,
  membershipId: string,
): Promise<LeadProjectMembershipRecord | null> {
  await connectDb();
  const document = await LeadProjectMembershipModel.findOne(
    withWorkspaceScope(workspaceId, { _id: membershipId, archivedAt: null }),
  ).lean<LeadProjectMembershipDocument>();
  return document ? toMembershipRecord(document) : null;
}

export async function findMembershipByLeadAndProject(
  workspaceId: string,
  leadId: string,
  projectId: string,
): Promise<LeadProjectMembershipRecord | null> {
  await connectDb();
  const document = await LeadProjectMembershipModel.findOne(
    withWorkspaceScope(workspaceId, {
      leadId,
      projectId,
      archivedAt: null,
    }),
  ).lean<LeadProjectMembershipDocument>();
  return document ? toMembershipRecord(document) : null;
}

export async function createMembership(input: {
  workspaceId: string;
  leadId: string;
  projectId: string;
  isPrimary: boolean;
  joinedAt: Date;
  sourceOrder: number;
  source: LeadProjectMembershipSource;
  provenance?: LeadProjectMembershipProvenance | null;
  createdBy?: string | null;
}): Promise<LeadProjectMembershipRecord> {
  await connectDb();
  try {
    const document = await LeadProjectMembershipModel.create({
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      projectId: input.projectId,
      isPrimary: input.isPrimary,
      joinedAt: input.joinedAt,
      sourceOrder: input.sourceOrder,
      source: input.source,
      provenance: input.provenance ?? null,
      createdBy: input.createdBy ?? null,
      archivedAt: null,
    });
    return toMembershipRecord(document.toObject() as LeadProjectMembershipDocument);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "CONFLICT",
        "This contact is already a member of that project, or another primary membership exists.",
      );
    }
    throw error;
  }
}

export async function updateMembership(
  workspaceId: string,
  membershipId: string,
  input: Partial<{
    isPrimary: boolean;
    sourceOrder: number;
    joinedAt: Date;
    source: LeadProjectMembershipSource;
    provenance: LeadProjectMembershipProvenance | null;
  }>,
): Promise<LeadProjectMembershipRecord | null> {
  await connectDb();
  try {
    const document = await LeadProjectMembershipModel.findOneAndUpdate(
      withWorkspaceScope(workspaceId, { _id: membershipId, archivedAt: null }),
      { $set: input },
      { new: true },
    ).lean<LeadProjectMembershipDocument>();
    return document ? toMembershipRecord(document) : null;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "CONFLICT",
        "A contact may have only one primary project membership.",
      );
    }
    throw error;
  }
}

export async function archiveMembership(
  workspaceId: string,
  membershipId: string,
): Promise<LeadProjectMembershipRecord | null> {
  await connectDb();
  const document = await LeadProjectMembershipModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: membershipId, archivedAt: null }),
    { $set: { archivedAt: new Date(), isPrimary: false } },
    { new: true },
  ).lean<LeadProjectMembershipDocument>();
  return document ? toMembershipRecord(document) : null;
}

export async function deleteMembershipsForLeadIds(
  workspaceId: string,
  leadIds: string[],
): Promise<number> {
  if (leadIds.length === 0) {
    return 0;
  }
  await connectDb();
  const result = await LeadProjectMembershipModel.deleteMany(
    withWorkspaceScope(workspaceId, { leadId: { $in: leadIds } }),
  );
  return result.deletedCount ?? 0;
}

export async function countMembershipsForWorkspace(
  workspaceId: string,
): Promise<number> {
  await connectDb();
  return LeadProjectMembershipModel.countDocuments(
    withWorkspaceScope(workspaceId, { archivedAt: null }),
  );
}

export async function findLeadIdsMissingMembership(
  workspaceId: string,
  leadIds: string[],
): Promise<string[]> {
  if (leadIds.length === 0) {
    return [];
  }
  await connectDb();
  const documents = await LeadProjectMembershipModel.find(
    withWorkspaceScope(workspaceId, {
      leadId: { $in: leadIds },
      archivedAt: null,
    }),
  )
    .select({ leadId: 1 })
    .lean<Array<{ leadId: mongoose.Types.ObjectId }>>();

  const existing = new Set(documents.map((document) => document.leadId.toString()));
  return leadIds.filter((leadId) => !existing.has(leadId));
}
