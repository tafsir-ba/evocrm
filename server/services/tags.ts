import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  archiveTag,
  createTag,
  findActiveTagByNormalizedName,
  findTagById,
  findTags,
  updateTag,
  type TagListFilter,
  type TagRecord,
} from "@/server/repositories/tags";
import type { CreateTagInput, UpdateTagInput } from "@/server/validation/dictionaries";

export async function listTagsForWorkspace(
  workspaceId: string,
  filter: TagListFilter = {},
): Promise<TagRecord[]> {
  return findTags(workspaceId, filter);
}

export async function createTagForWorkspace(
  workspaceId: string,
  actorId: string,
  input: CreateTagInput,
): Promise<TagRecord> {
  const normalized = input.name.toLowerCase().trim();
  const duplicate = await findActiveTagByNormalizedName(workspaceId, normalized);

  if (duplicate) {
    throw new AppError("CONFLICT", "A tag with this name already exists.");
  }

  const tag = await createTag({
    workspaceId,
    name: input.name.trim(),
    color: input.color,
    entityTypes: input.entityTypes,
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "tag.created",
    entityType: "tag",
    entityId: tag.id,
    after: {
      name: tag.name,
      entityTypes: tag.entityTypes,
    },
  });

  return tag;
}

export async function updateTagForWorkspace(
  workspaceId: string,
  tagId: string,
  actorId: string,
  input: UpdateTagInput,
): Promise<TagRecord> {
  const existing = await findTagById(workspaceId, tagId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Tag not found.");
  }

  if (input.name) {
    const normalized = input.name.toLowerCase().trim();
    const duplicate = await findActiveTagByNormalizedName(workspaceId, normalized);

    if (duplicate && duplicate.id !== tagId) {
      throw new AppError("CONFLICT", "A tag with this name already exists.");
    }
  }

  const updatePayload: Parameters<typeof updateTag>[2] = {};

  if (input.name !== undefined) {
    updatePayload.name = input.name.trim();
    updatePayload.nameNormalized = input.name.toLowerCase().trim();
  }
  if (input.color !== undefined) {
    updatePayload.color = input.color;
  }
  if (input.entityTypes !== undefined) {
    updatePayload.entityTypes = input.entityTypes;
  }

  const updated = await updateTag(workspaceId, tagId, updatePayload);

  if (!updated) {
    throw new AppError("NOT_FOUND", "Tag not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "tag.updated",
    entityType: "tag",
    entityId: tagId,
    before: {
      name: existing.name,
      color: existing.color,
      entityTypes: existing.entityTypes,
    },
    after: {
      name: updated.name,
      color: updated.color,
      entityTypes: updated.entityTypes,
    },
  });

  return updated;
}

export async function archiveTagForWorkspace(
  workspaceId: string,
  tagId: string,
  actorId: string,
): Promise<TagRecord> {
  const existing = await findTagById(workspaceId, tagId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Tag not found.");
  }

  const archived = await archiveTag(workspaceId, tagId);

  if (!archived) {
    throw new AppError("NOT_FOUND", "Tag not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "tag.archived",
    entityType: "tag",
    entityId: tagId,
    before: { archivedAt: null },
    after: { archivedAt: archived.archivedAt },
  });

  return archived;
}
