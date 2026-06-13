import "server-only";

import { connectDb } from "@/server/db/mongoose";
import {
  DictionaryItemModel,
  type DictionaryItemDocument,
} from "@/models/dictionary-item";
import type { DictionaryType } from "@/server/dictionaries/constants";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type DictionaryItemRecord = {
  id: string;
  workspaceId: string;
  dictionaryId: string;
  type: DictionaryType;
  label: string;
  key: string;
  color: string;
  order: number;
  isDefault: boolean;
  isActive: boolean;
  isSystem: boolean;
  behavior?: string;
  defaultProbability?: number;
  createdAt: Date;
  updatedAt: Date;
};

function toDictionaryItemRecord(
  document: DictionaryItemDocument,
): DictionaryItemRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    dictionaryId: document.dictionaryId.toString(),
    type: document.type as DictionaryType,
    label: document.label,
    key: document.key,
    color: document.color,
    order: document.order,
    isDefault: document.isDefault,
    isActive: document.isActive,
    isSystem: document.isSystem,
    behavior: document.behavior ?? undefined,
    defaultProbability: document.defaultProbability ?? undefined,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export type DictionaryItemListFilter = {
  type?: DictionaryType;
  dictionaryId?: string;
  includeInactive?: boolean;
};

export async function findDictionaryItems(
  workspaceId: string,
  filter: DictionaryItemListFilter = {},
): Promise<DictionaryItemRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = {};

  if (filter.type) {
    query.type = filter.type;
  }
  if (filter.dictionaryId) {
    query.dictionaryId = filter.dictionaryId;
  }
  if (!filter.includeInactive) {
    query.isActive = true;
  }

  const documents = await DictionaryItemModel.find(
    withWorkspaceScope(workspaceId, query),
  )
    .sort({ order: 1, label: 1 })
    .lean<DictionaryItemDocument[]>();

  return documents.map(toDictionaryItemRecord);
}

export async function findDictionaryItemById(
  workspaceId: string,
  itemId: string,
): Promise<DictionaryItemRecord | null> {
  await connectDb();
  const document = await DictionaryItemModel.findOne(
    withWorkspaceScope(workspaceId, { _id: itemId }),
  ).lean<DictionaryItemDocument>();
  return document ? toDictionaryItemRecord(document) : null;
}

export async function findDictionaryItemByTypeAndKey(
  workspaceId: string,
  type: DictionaryType,
  key: string,
): Promise<DictionaryItemRecord | null> {
  await connectDb();
  const document = await DictionaryItemModel.findOne(
    withWorkspaceScope(workspaceId, {
      type,
      key: key.toLowerCase().trim(),
    }),
  ).lean<DictionaryItemDocument>();
  return document ? toDictionaryItemRecord(document) : null;
}

export async function findActiveDictionaryItemByTypeAndLabel(
  workspaceId: string,
  type: DictionaryType,
  label: string,
): Promise<DictionaryItemRecord | null> {
  await connectDb();
  const normalized = label.trim().toLowerCase();
  const document = await DictionaryItemModel.findOne(
    withWorkspaceScope(workspaceId, {
      type,
      isActive: true,
      label: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    }),
  ).lean<DictionaryItemDocument>();
  return document ? toDictionaryItemRecord(document) : null;
}

export async function createDictionaryItem(input: {
  workspaceId: string;
  dictionaryId: string;
  type: DictionaryType;
  label: string;
  key: string;
  color: string;
  order: number;
  isDefault?: boolean;
  isActive?: boolean;
  isSystem?: boolean;
  behavior?: string;
  defaultProbability?: number;
}): Promise<DictionaryItemRecord> {
  await connectDb();
  const document = await DictionaryItemModel.create({
    workspaceId: input.workspaceId,
    dictionaryId: input.dictionaryId,
    type: input.type,
    label: input.label,
    key: input.key.toLowerCase().trim(),
    color: input.color,
    order: input.order,
    isDefault: input.isDefault ?? false,
    isActive: input.isActive ?? true,
    isSystem: input.isSystem ?? false,
    behavior: input.behavior,
    defaultProbability: input.defaultProbability,
  });
  return toDictionaryItemRecord(document.toObject() as DictionaryItemDocument);
}

export async function updateDictionaryItem(
  workspaceId: string,
  itemId: string,
  input: Partial<{
    label: string;
    color: string;
    order: number;
    isDefault: boolean;
    isActive: boolean;
    behavior: string;
    defaultProbability: number;
  }>,
): Promise<DictionaryItemRecord | null> {
  await connectDb();
  const document = await DictionaryItemModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: itemId }),
    { $set: input },
    { new: true },
  ).lean<DictionaryItemDocument>();
  return document ? toDictionaryItemRecord(document) : null;
}

export async function inactivateDictionaryItem(
  workspaceId: string,
  itemId: string,
): Promise<DictionaryItemRecord | null> {
  return updateDictionaryItem(workspaceId, itemId, { isActive: false });
}

export async function getMaxOrderForDictionary(
  workspaceId: string,
  dictionaryId: string,
): Promise<number> {
  await connectDb();
  const document = await DictionaryItemModel.findOne(
    withWorkspaceScope(workspaceId, { dictionaryId }),
  )
    .sort({ order: -1 })
    .lean<DictionaryItemDocument>();
  return document?.order ?? -1;
}

export async function clearDefaultForDictionaryType(
  workspaceId: string,
  type: DictionaryType,
  exceptItemId?: string,
): Promise<void> {
  await connectDb();
  const query: Record<string, unknown> = { type, isDefault: true };
  if (exceptItemId) {
    query._id = { $ne: exceptItemId };
  }
  await DictionaryItemModel.updateMany(withWorkspaceScope(workspaceId, query), {
    $set: { isDefault: false },
  });
}
