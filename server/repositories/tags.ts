import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { TagModel, type TagDocument } from "@/models/tag";
import type { TagEntityType } from "@/server/dictionaries/constants";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type TagRecord = {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  entityTypes: TagEntityType[];
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toTagRecord(document: TagDocument): TagRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    name: document.name,
    color: document.color,
    entityTypes: document.entityTypes as TagEntityType[],
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export type TagListFilter = {
  entityType?: TagEntityType;
  includeArchived?: boolean;
};

export async function findTags(
  workspaceId: string,
  filter: TagListFilter = {},
): Promise<TagRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = {};

  if (!filter.includeArchived) {
    query.archivedAt = null;
  }
  if (filter.entityType) {
    query.entityTypes = filter.entityType;
  }

  const documents = await TagModel.find(withWorkspaceScope(workspaceId, query))
    .sort({ name: 1 })
    .lean<TagDocument[]>();

  return documents.map(toTagRecord);
}

export async function findTagById(
  workspaceId: string,
  tagId: string,
): Promise<TagRecord | null> {
  await connectDb();
  const document = await TagModel.findOne(
    withWorkspaceScope(workspaceId, { _id: tagId }),
  ).lean<TagDocument>();
  return document ? toTagRecord(document) : null;
}

export async function findActiveTagByNormalizedName(
  workspaceId: string,
  nameNormalized: string,
): Promise<TagRecord | null> {
  await connectDb();
  const document = await TagModel.findOne(
    withWorkspaceScope(workspaceId, {
      nameNormalized: nameNormalized.toLowerCase().trim(),
      archivedAt: null,
    }),
  ).lean<TagDocument>();
  return document ? toTagRecord(document) : null;
}

export async function createTag(input: {
  workspaceId: string;
  name: string;
  color: string;
  entityTypes: TagEntityType[];
}): Promise<TagRecord> {
  await connectDb();
  const document = await TagModel.create({
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    nameNormalized: input.name.toLowerCase().trim(),
    color: input.color,
    entityTypes: input.entityTypes,
    archivedAt: null,
  });
  return toTagRecord(document.toObject() as TagDocument);
}

export async function updateTag(
  workspaceId: string,
  tagId: string,
  input: Partial<{
    name: string;
    nameNormalized: string;
    color: string;
    entityTypes: TagEntityType[];
  }>,
): Promise<TagRecord | null> {
  await connectDb();
  const document = await TagModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: tagId, archivedAt: null }),
    { $set: input },
    { new: true },
  ).lean<TagDocument>();
  return document ? toTagRecord(document) : null;
}

export async function archiveTag(
  workspaceId: string,
  tagId: string,
): Promise<TagRecord | null> {
  await connectDb();
  const document = await TagModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: tagId, archivedAt: null }),
    { $set: { archivedAt: new Date() } },
    { new: true },
  ).lean<TagDocument>();
  return document ? toTagRecord(document) : null;
}
