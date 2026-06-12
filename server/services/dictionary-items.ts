import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  getAllowedBehaviorsForType,
  validateBehaviorForType,
  type DictionaryType,
} from "@/server/dictionaries/constants";
import {
  clearDefaultForDictionaryType,
  createDictionaryItem,
  findDictionaryItemById,
  findDictionaryItemByTypeAndKey,
  findDictionaryItems,
  getMaxOrderForDictionary,
  inactivateDictionaryItem,
  updateDictionaryItem,
  type DictionaryItemListFilter,
  type DictionaryItemRecord,
} from "@/server/repositories/dictionary-items";
import { findDictionaryById } from "@/server/repositories/dictionaries";
import type {
  CreateDictionaryItemInput,
  UpdateDictionaryItemInput,
} from "@/server/validation/dictionaries";
import { ensureDefaultDictionaries } from "@/server/services/default-dictionaries";

const TERMINAL_BEHAVIORS = new Set(["terminal_won", "terminal_lost"]);

export async function listDictionaryItemsForWorkspace(
  workspaceId: string,
  filter: DictionaryItemListFilter = {},
): Promise<DictionaryItemRecord[]> {
  await ensureDefaultDictionaries(workspaceId);
  return findDictionaryItems(workspaceId, filter);
}

function assertBehaviorAllowed(
  type: DictionaryType,
  behavior: string | undefined,
): void {
  if (!validateBehaviorForType(type, behavior)) {
    const allowed = getAllowedBehaviorsForType(type);
    throw new AppError("VALIDATION_ERROR", "Invalid behavior for dictionary type.", {
      details: {
        behavior: [
          allowed
            ? `Behavior must be one of: ${allowed.join(", ")}`
            : "Behavior is not allowed for this dictionary type.",
        ],
      },
    });
  }
}

function assertSystemItemUpdateAllowed(
  existing: DictionaryItemRecord,
  input: UpdateDictionaryItemInput,
): void {
  if (!existing.isSystem) {
    return;
  }

  if (input.isActive === false) {
    throw new AppError("FORBIDDEN", "System dictionary items cannot be inactivated.");
  }

  if (input.behavior !== undefined && input.behavior !== existing.behavior) {
    throw new AppError("FORBIDDEN", "System dictionary item behavior cannot be changed.");
  }

  if (
    input.defaultProbability !== undefined &&
    input.defaultProbability !== existing.defaultProbability
  ) {
    throw new AppError(
      "FORBIDDEN",
      "System dictionary item default probability cannot be changed.",
    );
  }
}

function assertSystemBehaviorProtection(
  existing: DictionaryItemRecord,
  input: UpdateDictionaryItemInput,
): void {
  if (!existing.isSystem) {
    return;
  }

  if (
    input.behavior !== undefined &&
    existing.behavior !== undefined &&
    TERMINAL_BEHAVIORS.has(existing.behavior) &&
    input.behavior !== existing.behavior
  ) {
    throw new AppError(
      "FORBIDDEN",
      "System terminal status behavior cannot be changed.",
    );
  }
}

export async function createDictionaryItemForWorkspace(
  workspaceId: string,
  actorId: string,
  input: CreateDictionaryItemInput,
): Promise<DictionaryItemRecord> {
  await ensureDefaultDictionaries(workspaceId);

  const dictionary = await findDictionaryById(workspaceId, input.dictionaryId);

  if (!dictionary) {
    throw new AppError("NOT_FOUND", "Dictionary not found.");
  }

  if (dictionary.type !== input.type) {
    throw new AppError("VALIDATION_ERROR", "Dictionary type mismatch.", {
      details: { type: ["Item type must match parent dictionary type."] },
    });
  }

  assertBehaviorAllowed(input.type, input.behavior);

  const duplicate = await findDictionaryItemByTypeAndKey(
    workspaceId,
    input.type,
    input.key,
  );

  if (duplicate) {
    throw new AppError("CONFLICT", "Dictionary item key already exists.");
  }

  const maxOrder = await getMaxOrderForDictionary(workspaceId, dictionary.id);
  const order = input.order ?? maxOrder + 1;

  if (input.isDefault) {
    await clearDefaultForDictionaryType(workspaceId, input.type);
  }

  const item = await createDictionaryItem({
    workspaceId,
    dictionaryId: dictionary.id,
    type: input.type,
    label: input.label,
    key: input.key,
    color: input.color,
    order,
    isDefault: input.isDefault ?? false,
    isActive: input.isActive ?? true,
    isSystem: false,
    behavior: input.behavior,
    defaultProbability: input.defaultProbability,
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "dictionary_item.created",
    entityType: "dictionary_item",
    entityId: item.id,
    after: {
      type: item.type,
      key: item.key,
      label: item.label,
    },
  });

  return item;
}

export async function updateDictionaryItemForWorkspace(
  workspaceId: string,
  itemId: string,
  actorId: string,
  input: UpdateDictionaryItemInput,
): Promise<DictionaryItemRecord> {
  const existing = await findDictionaryItemById(workspaceId, itemId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Dictionary item not found.");
  }

  assertSystemItemUpdateAllowed(existing, input);
  assertSystemBehaviorProtection(existing, input);

  if (input.behavior !== undefined) {
    assertBehaviorAllowed(existing.type, input.behavior);
  }

  if (input.isDefault) {
    await clearDefaultForDictionaryType(workspaceId, existing.type, itemId);
  }

  const updated = await updateDictionaryItem(workspaceId, itemId, input);

  if (!updated) {
    throw new AppError("NOT_FOUND", "Dictionary item not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "dictionary_item.updated",
    entityType: "dictionary_item",
    entityId: itemId,
    before: {
      label: existing.label,
      color: existing.color,
      order: existing.order,
      isActive: existing.isActive,
      behavior: existing.behavior,
    },
    after: {
      label: updated.label,
      color: updated.color,
      order: updated.order,
      isActive: updated.isActive,
      behavior: updated.behavior,
    },
  });

  return updated;
}

export async function inactivateDictionaryItemForWorkspace(
  workspaceId: string,
  itemId: string,
  actorId: string,
): Promise<DictionaryItemRecord> {
  const existing = await findDictionaryItemById(workspaceId, itemId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Dictionary item not found.");
  }

  if (existing.isSystem) {
    throw new AppError("FORBIDDEN", "System dictionary items cannot be deleted.");
  }

  const updated = await inactivateDictionaryItem(workspaceId, itemId);

  if (!updated) {
    throw new AppError("NOT_FOUND", "Dictionary item not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "dictionary_item.inactivated",
    entityType: "dictionary_item",
    entityId: itemId,
    before: { isActive: existing.isActive },
    after: { isActive: false },
  });

  return updated;
}

export function isTerminalWonBehavior(behavior: string | undefined): boolean {
  return behavior === "terminal_won";
}

export function isTerminalLostBehavior(behavior: string | undefined): boolean {
  return behavior === "terminal_lost";
}

export function isOpenOpportunityBehavior(behavior: string | undefined): boolean {
  return behavior === "open";
}

export function isActivityCompletedBehavior(behavior: string | undefined): boolean {
  return behavior === "completed";
}

export function isActivityPendingBehavior(behavior: string | undefined): boolean {
  return behavior === "pending";
}

export function isActivityCancelledBehavior(behavior: string | undefined): boolean {
  return behavior === "cancelled";
}
