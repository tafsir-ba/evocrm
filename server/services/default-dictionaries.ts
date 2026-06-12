import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { DEFAULT_DICTIONARY_SEEDS } from "@/server/dictionaries/constants";
import {
  createDictionary,
  findDictionaryByType,
} from "@/server/repositories/dictionaries";
import {
  createDictionaryItem,
  findDictionaryItemByTypeAndKey,
} from "@/server/repositories/dictionary-items";

export type EnsureDefaultDictionariesResult = {
  dictionariesCreated: number;
  itemsCreated: number;
};

/**
 * Idempotently seed system dictionaries and default items for a workspace.
 * Safe to run multiple times — does not overwrite existing items.
 */
export async function ensureDefaultDictionaries(
  workspaceId: string,
  actorId?: string,
): Promise<EnsureDefaultDictionariesResult> {
  let dictionariesCreated = 0;
  let itemsCreated = 0;

  for (const seed of DEFAULT_DICTIONARY_SEEDS) {
    let dictionary = await findDictionaryByType(workspaceId, seed.type);

    if (!dictionary) {
      dictionary = await createDictionary({
        workspaceId,
        type: seed.type,
        name: seed.name,
        isSystem: true,
      });
      dictionariesCreated += 1;
    }

    for (const itemSeed of seed.items) {
      const existing = await findDictionaryItemByTypeAndKey(
        workspaceId,
        seed.type,
        itemSeed.key,
      );

      if (existing) {
        continue;
      }

      await createDictionaryItem({
        workspaceId,
        dictionaryId: dictionary.id,
        type: seed.type,
        label: itemSeed.label,
        key: itemSeed.key,
        color: itemSeed.color,
        order: itemSeed.order,
        isDefault: itemSeed.isDefault ?? false,
        isActive: true,
        isSystem: true,
        behavior: itemSeed.behavior,
        defaultProbability: itemSeed.defaultProbability,
      });
      itemsCreated += 1;
    }
  }

  if (actorId && (dictionariesCreated > 0 || itemsCreated > 0)) {
    await createAuditLog({
      workspaceId,
      actorId,
      action: "dictionary.defaults_seeded",
      entityType: "dictionary",
      entityId: workspaceId,
      after: {
        dictionariesCreated,
        itemsCreated,
      },
    });
  }

  return { dictionariesCreated, itemsCreated };
}
