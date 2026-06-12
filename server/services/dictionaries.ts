import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import type { DictionaryType } from "@/server/dictionaries/constants";
import {
  countDictionaryItemsByDictionaryId,
  findDictionaries,
  findDictionaryById,
  updateDictionary,
  type DictionaryRecord,
} from "@/server/repositories/dictionaries";
import { ensureDefaultDictionaries } from "@/server/services/default-dictionaries";

export type DictionaryWithItemCount = DictionaryRecord & {
  itemCount: number;
};

export async function listDictionariesForWorkspace(
  workspaceId: string,
  filter?: { type?: DictionaryType },
): Promise<DictionaryWithItemCount[]> {
  await ensureDefaultDictionaries(workspaceId);
  const dictionaries = await findDictionaries(workspaceId, filter);

  const results: DictionaryWithItemCount[] = [];
  for (const dictionary of dictionaries) {
    const itemCount = await countDictionaryItemsByDictionaryId(
      workspaceId,
      dictionary.id,
    );
    results.push({ ...dictionary, itemCount });
  }

  return results;
}

export async function getDictionaryForWorkspace(
  workspaceId: string,
  dictionaryId: string,
): Promise<DictionaryWithItemCount> {
  await ensureDefaultDictionaries(workspaceId);
  const dictionary = await findDictionaryById(workspaceId, dictionaryId);

  if (!dictionary) {
    throw new AppError("NOT_FOUND", "Dictionary not found.");
  }

  const itemCount = await countDictionaryItemsByDictionaryId(
    workspaceId,
    dictionary.id,
  );

  return { ...dictionary, itemCount };
}

export async function updateDictionaryForWorkspace(
  workspaceId: string,
  dictionaryId: string,
  actorId: string,
  input: { name?: string },
): Promise<DictionaryRecord> {
  const existing = await findDictionaryById(workspaceId, dictionaryId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Dictionary not found.");
  }

  const updated = await updateDictionary(workspaceId, dictionaryId, input);

  if (!updated) {
    throw new AppError("NOT_FOUND", "Dictionary not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "dictionary.updated",
    entityType: "dictionary",
    entityId: dictionaryId,
    before: { name: existing.name },
    after: { name: updated.name },
  });

  return updated;
}
