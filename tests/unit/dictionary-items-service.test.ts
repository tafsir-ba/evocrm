import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/server/errors";
import {
  createDictionaryItemForWorkspace,
  inactivateDictionaryItemForWorkspace,
} from "@/server/services/dictionary-items";

vi.mock("@/server/services/default-dictionaries", () => ({
  ensureDefaultDictionaries: vi.fn(),
}));

vi.mock("@/server/repositories/dictionaries", () => ({
  findDictionaryById: vi.fn(),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemByTypeAndKey: vi.fn(),
  getMaxOrderForDictionary: vi.fn(),
  clearDefaultForDictionaryType: vi.fn(),
  createDictionaryItem: vi.fn(),
  findDictionaryItemById: vi.fn(),
  inactivateDictionaryItem: vi.fn(),
  updateDictionaryItem: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findDictionaryById } from "@/server/repositories/dictionaries";
import {
  createDictionaryItem,
  findDictionaryItemById,
  findDictionaryItemByTypeAndKey,
  getMaxOrderForDictionary,
  inactivateDictionaryItem,
} from "@/server/repositories/dictionary-items";

describe("dictionary item service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid behavior for opportunity status", async () => {
    vi.mocked(findDictionaryById).mockResolvedValue({
      id: "dict-1",
      workspaceId: "ws-1",
      type: "opportunity_status",
      name: "Opportunity status",
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findDictionaryItemByTypeAndKey).mockResolvedValue(null);

    await expect(
      createDictionaryItemForWorkspace("ws-1", "user-1", {
        dictionaryId: "dict-1",
        type: "opportunity_status",
        label: "Custom",
        key: "custom",
        color: "#3B82F6",
        behavior: "invalid_behavior",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects behavior on types that do not support it", async () => {
    vi.mocked(findDictionaryById).mockResolvedValue({
      id: "dict-1",
      workspaceId: "ws-1",
      type: "lead_status",
      name: "Lead status",
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findDictionaryItemByTypeAndKey).mockResolvedValue(null);

    await expect(
      createDictionaryItemForWorkspace("ws-1", "user-1", {
        dictionaryId: "dict-1",
        type: "lead_status",
        label: "Custom",
        key: "custom",
        color: "#3B82F6",
        behavior: "open",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("creates dictionary item with valid data", async () => {
    vi.mocked(findDictionaryById).mockResolvedValue({
      id: "dict-1",
      workspaceId: "ws-1",
      type: "lead_source",
      name: "Lead source",
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findDictionaryItemByTypeAndKey).mockResolvedValue(null);
    vi.mocked(getMaxOrderForDictionary).mockResolvedValue(6);
    vi.mocked(createDictionaryItem).mockResolvedValue({
      id: "item-1",
      workspaceId: "ws-1",
      dictionaryId: "dict-1",
      type: "lead_source",
      label: "Partner",
      key: "partner",
      color: "#3B82F6",
      order: 7,
      isDefault: false,
      isActive: true,
      isSystem: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const item = await createDictionaryItemForWorkspace("ws-1", "user-1", {
      dictionaryId: "dict-1",
      type: "lead_source",
      label: "Partner",
      key: "partner",
      color: "#3B82F6",
    });

    expect(item.key).toBe("partner");
  });

  it("inactivates non-system items instead of hard delete", async () => {
    vi.mocked(findDictionaryItemById).mockResolvedValue({
      id: "item-1",
      workspaceId: "ws-1",
      dictionaryId: "dict-1",
      type: "lead_source",
      label: "Partner",
      key: "partner",
      color: "#3B82F6",
      order: 7,
      isDefault: false,
      isActive: true,
      isSystem: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(inactivateDictionaryItem).mockResolvedValue({
      id: "item-1",
      workspaceId: "ws-1",
      dictionaryId: "dict-1",
      type: "lead_source",
      label: "Partner",
      key: "partner",
      color: "#3B82F6",
      order: 7,
      isDefault: false,
      isActive: false,
      isSystem: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const item = await inactivateDictionaryItemForWorkspace(
      "ws-1",
      "item-1",
      "user-1",
    );

    expect(item.isActive).toBe(false);
  });

  it("rejects inactivation of system items", async () => {
    vi.mocked(findDictionaryItemById).mockResolvedValue({
      id: "item-1",
      workspaceId: "ws-1",
      dictionaryId: "dict-1",
      type: "opportunity_status",
      label: "Won",
      key: "won",
      color: "#10B981",
      order: 5,
      isDefault: false,
      isActive: true,
      isSystem: true,
      behavior: "terminal_won",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      inactivateDictionaryItemForWorkspace("ws-1", "item-1", "user-1"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects PATCH inactivation of system items via update service", async () => {
    const { updateDictionaryItemForWorkspace } = await import(
      "@/server/services/dictionary-items"
    );

    vi.mocked(findDictionaryItemById).mockResolvedValue({
      id: "item-1",
      workspaceId: "ws-1",
      dictionaryId: "dict-1",
      type: "opportunity_status",
      label: "Won",
      key: "won",
      color: "#10B981",
      order: 5,
      isDefault: false,
      isActive: true,
      isSystem: true,
      behavior: "terminal_won",
      defaultProbability: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      updateDictionaryItemForWorkspace("ws-1", "item-1", "user-1", {
        isActive: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects behavior changes on system items", async () => {
    const { updateDictionaryItemForWorkspace } = await import(
      "@/server/services/dictionary-items"
    );

    vi.mocked(findDictionaryItemById).mockResolvedValue({
      id: "item-1",
      workspaceId: "ws-1",
      dictionaryId: "dict-1",
      type: "opportunity_status",
      label: "New",
      key: "new",
      color: "#3B82F6",
      order: 0,
      isDefault: true,
      isActive: true,
      isSystem: true,
      behavior: "open",
      defaultProbability: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      updateDictionaryItemForWorkspace("ws-1", "item-1", "user-1", {
        behavior: "terminal_won",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
