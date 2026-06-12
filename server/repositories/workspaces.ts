import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { WorkspaceModel, type WorkspaceDocument } from "@/models/workspace";

export type WorkspaceRecord = {
  id: string;
  name: string;
  slug: string;
  type: string;
  timezone: string;
  defaultCurrency: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function toWorkspaceRecord(document: WorkspaceDocument): WorkspaceRecord {
  return {
    id: document._id.toString(),
    name: document.name,
    slug: document.slug,
    type: document.type,
    timezone: document.timezone,
    defaultCurrency: document.defaultCurrency,
    createdBy: document.createdBy.toString(),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findWorkspaceBySlug(slug: string): Promise<WorkspaceRecord | null> {
  await connectDb();
  const document = await WorkspaceModel.findOne({
    slug: slug.toLowerCase().trim(),
  }).lean<WorkspaceDocument>();
  return document ? toWorkspaceRecord(document) : null;
}

export async function findWorkspaceById(workspaceId: string): Promise<WorkspaceRecord | null> {
  await connectDb();
  const document = await WorkspaceModel.findById(workspaceId).lean<WorkspaceDocument>();
  return document ? toWorkspaceRecord(document) : null;
}

export async function slugExists(slug: string): Promise<boolean> {
  await connectDb();
  const count = await WorkspaceModel.countDocuments({ slug: slug.toLowerCase().trim() });
  return count > 0;
}

export async function createWorkspace(input: {
  name: string;
  slug: string;
  type: string;
  timezone: string;
  defaultCurrency: string;
  createdBy: string;
}): Promise<WorkspaceRecord> {
  await connectDb();
  const document = await WorkspaceModel.create({
    name: input.name,
    slug: input.slug.toLowerCase().trim(),
    type: input.type,
    timezone: input.timezone,
    defaultCurrency: input.defaultCurrency,
    createdBy: input.createdBy,
  });

  return toWorkspaceRecord(document.toObject() as WorkspaceDocument);
}
