import "server-only";

import { connectDb } from "@/server/db/mongoose";
import {
  DictionaryModel,
  type DictionaryDocument,
} from "@/models/dictionary";
import type { DictionaryType } from "@/server/dictionaries/constants";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type DictionaryRecord = {
  id: string;
  workspaceId: string;
  type: DictionaryType;
  name: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toDictionaryRecord(document: DictionaryDocument): DictionaryRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    type: document.type as DictionaryType,
    name: document.name,
    isSystem: document.isSystem,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findDictionaries(
  workspaceId: string,
  filter?: { type?: DictionaryType },
): Promise<DictionaryRecord[]> {
  await connectDb();
  const query = withWorkspaceScope(workspaceId, filter ?? {});
  const documents = await DictionaryModel.find(query)
    .sort({ type: 1 })
    .lean<DictionaryDocument[]>();
  return documents.map(toDictionaryRecord);
}

export async function findDictionaryById(
  workspaceId: string,
  dictionaryId: string,
): Promise<DictionaryRecord | null> {
  await connectDb();
  const document = await DictionaryModel.findOne(
    withWorkspaceScope(workspaceId, { _id: dictionaryId }),
  ).lean<DictionaryDocument>();
  return document ? toDictionaryRecord(document) : null;
}

export async function findDictionaryByType(
  workspaceId: string,
  type: DictionaryType,
): Promise<DictionaryRecord | null> {
  await connectDb();
  const document = await DictionaryModel.findOne(
    withWorkspaceScope(workspaceId, { type }),
  ).lean<DictionaryDocument>();
  return document ? toDictionaryRecord(document) : null;
}

export async function createDictionary(input: {
  workspaceId: string;
  type: DictionaryType;
  name: string;
  isSystem: boolean;
}): Promise<DictionaryRecord> {
  await connectDb();
  const document = await DictionaryModel.create({
    workspaceId: input.workspaceId,
    type: input.type,
    name: input.name,
    isSystem: input.isSystem,
  });
  return toDictionaryRecord(document.toObject() as DictionaryDocument);
}

export async function updateDictionary(
  workspaceId: string,
  dictionaryId: string,
  input: { name?: string },
): Promise<DictionaryRecord | null> {
  await connectDb();
  const document = await DictionaryModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: dictionaryId }),
    { $set: input },
    { new: true },
  ).lean<DictionaryDocument>();
  return document ? toDictionaryRecord(document) : null;
}

export async function countDictionaryItemsByDictionaryId(
  workspaceId: string,
  dictionaryId: string,
): Promise<number> {
  await connectDb();
  const { DictionaryItemModel } = await import("@/models/dictionary-item");
  return DictionaryItemModel.countDocuments(
    withWorkspaceScope(workspaceId, { dictionaryId }),
  );
}
