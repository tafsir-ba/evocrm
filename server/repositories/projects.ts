import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { ProjectModel, type ProjectDocument } from "@/models/project";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type ProjectRecord = {
  id: string;
  workspaceId: string;
  name: string;
  reference: string | null;
  statusId: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  description: string | null;
  createdBy: string;
  ownerId: string | null;
  assignedTo: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toProjectRecord(document: ProjectDocument): ProjectRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    name: document.name,
    reference: document.reference ?? null,
    statusId: document.statusId?.toString() ?? null,
    address: document.address ?? null,
    city: document.city ?? null,
    country: document.country ?? null,
    description: document.description ?? null,
    createdBy: document.createdBy.toString(),
    ownerId: document.ownerId?.toString() ?? null,
    assignedTo: document.assignedTo?.toString() ?? null,
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export type ProjectListFilter = {
  includeArchived?: boolean;
  search?: string;
  assignedTo?: string;
};

function buildListQuery(filter: ProjectListFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (!filter.includeArchived) {
    query.archivedAt = null;
  }

  if (filter.assignedTo) {
    query.assignedTo = filter.assignedTo;
  }

  if (filter.search) {
    const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    query.$or = [{ name: regex }, { reference: regex }, { city: regex }];
  }

  return query;
}

export async function findProjects(
  workspaceId: string,
  filter: ProjectListFilter = {},
): Promise<ProjectRecord[]> {
  await connectDb();
  const documents = await ProjectModel.find(
    withWorkspaceScope(workspaceId, buildListQuery(filter)),
  )
    .sort({ createdAt: -1 })
    .lean<ProjectDocument[]>();

  return documents.map(toProjectRecord);
}

export async function findProjectById(
  workspaceId: string,
  projectId: string,
): Promise<ProjectRecord | null> {
  await connectDb();
  const document = await ProjectModel.findOne(
    withWorkspaceScope(workspaceId, { _id: projectId }),
  ).lean<ProjectDocument>();
  return document ? toProjectRecord(document) : null;
}

export async function findProjectByReference(
  workspaceId: string,
  reference: string,
): Promise<ProjectRecord | null> {
  await connectDb();
  const document = await ProjectModel.findOne(
    withWorkspaceScope(workspaceId, { reference: reference.trim() }),
  ).lean<ProjectDocument>();
  return document ? toProjectRecord(document) : null;
}

export async function createProject(input: {
  workspaceId: string;
  name: string;
  reference?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  description?: string | null;
  createdBy: string;
  ownerId?: string | null;
  assignedTo?: string | null;
}): Promise<ProjectRecord> {
  await connectDb();
  const document = await ProjectModel.create({
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    reference: input.reference?.trim() || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    country: input.country?.trim() || null,
    description: input.description?.trim() || null,
    createdBy: input.createdBy,
    ownerId: input.ownerId ?? null,
    assignedTo: input.assignedTo ?? null,
    archivedAt: null,
  });
  return toProjectRecord(document.toObject() as ProjectDocument);
}

export async function updateProject(
  workspaceId: string,
  projectId: string,
  input: Partial<{
    name: string;
    reference: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    description: string | null;
    ownerId: string | null;
    assignedTo: string | null;
  }>,
): Promise<ProjectRecord | null> {
  await connectDb();
  const document = await ProjectModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: projectId, archivedAt: null }),
    { $set: input },
    { new: true },
  ).lean<ProjectDocument>();
  return document ? toProjectRecord(document) : null;
}

export async function archiveProject(
  workspaceId: string,
  projectId: string,
): Promise<ProjectRecord | null> {
  await connectDb();
  const document = await ProjectModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: projectId, archivedAt: null }),
    { $set: { archivedAt: new Date() } },
    { new: true },
  ).lean<ProjectDocument>();
  return document ? toProjectRecord(document) : null;
}
