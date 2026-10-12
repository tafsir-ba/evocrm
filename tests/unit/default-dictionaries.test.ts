import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_DICTIONARY_SEEDS } from "@/server/dictionaries/constants";
import { ensureDefaultDictionaries } from "@/server/services/default-dictionaries";
import {
  isTerminalLostBehavior,
  isTerminalWonBehavior,
} from "@/server/services/dictionary-items";

vi.mock("@/server/repositories/dictionaries", () => ({
  findDictionaryByType: vi.fn(),
  createDictionary: vi.fn(),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemByTypeAndKey: vi.fn(),
  createDictionaryItem: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import {
  createDictionary,
  findDictionaryByType,
} from "@/server/repositories/dictionaries";
import {
  createDictionaryItem,
  findDictionaryItemByTypeAndKey,
} from "@/server/repositories/dictionary-items";

describe("default dictionaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds all dictionary types idempotently", async () => {
    vi.mocked(findDictionaryByType).mockResolvedValue(null);
    vi.mocked(findDictionaryItemByTypeAndKey).mockResolvedValue(null);
    vi.mocked(createDictionary).mockImplementation(async (input) => ({
      id: `dict-${input.type}`,
      workspaceId: input.workspaceId,
      type: input.type,
      name: input.name,
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await ensureDefaultDictionaries("ws-1", "user-1");

    expect(result.dictionariesCreated).toBe(DEFAULT_DICTIONARY_SEEDS.length);
    expect(createDictionary).toHaveBeenCalledTimes(
      DEFAULT_DICTIONARY_SEEDS.length,
    );
    expect(createDictionaryItem).toHaveBeenCalled();
  });

  it("does not duplicate existing items", async () => {
    vi.mocked(findDictionaryByType).mockImplementation(
      async (_workspaceId, type) => ({
        id: `dict-${type}`,
        workspaceId: "ws-1",
        type,
        name: type,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    vi.mocked(findDictionaryItemByTypeAndKey).mockResolvedValue({
      id: "existing",
      workspaceId: "ws-1",
      dictionaryId: "dict-opportunity_status",
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

    const result = await ensureDefaultDictionaries("ws-1");

    expect(result.dictionariesCreated).toBe(0);
    expect(result.itemsCreated).toBe(0);
    expect(createDictionaryItem).not.toHaveBeenCalled();
  });

  it("default opportunity statuses use behavior not labels", () => {
    const opportunity = DEFAULT_DICTIONARY_SEEDS.find(
      (seed) => seed.type === "opportunity_status",
    );

    const won = opportunity?.items.find((item) => item.key === "won");
    const lost = opportunity?.items.find((item) => item.key === "lost");

    expect(won?.behavior).toBe("terminal_won");
    expect(lost?.behavior).toBe("terminal_lost");
    expect(isTerminalWonBehavior(won?.behavior)).toBe(true);
    expect(isTerminalLostBehavior(lost?.behavior)).toBe(true);
  });

  it("default activity statuses have correct behavior", () => {
    const activity = DEFAULT_DICTIONARY_SEEDS.find(
      (seed) => seed.type === "activity_status",
    );

    expect(
      activity?.items.find((item) => item.key === "pending")?.behavior,
    ).toBe("pending");
    expect(
      activity?.items.find((item) => item.key === "completed")?.behavior,
    ).toBe("completed");
    expect(
      activity?.items.find((item) => item.key === "cancelled")?.behavior,
    ).toBe("cancelled");
  });

  it("adds the callback status and leaves existing lead statuses unchanged", async () => {
    const lead = DEFAULT_DICTIONARY_SEEDS.find(
      (seed) => seed.type === "lead_status",
    );
    expect(lead?.items.map((item) => item.key)).toEqual([
      "new",
      "contacted",
      "called_no_answer",
      "qualified",
      "lost",
    ]);
    expect(lead?.items.find((item) => item.key === "new")?.label).toBe("New");
    expect(lead?.items.find((item) => item.key === "contacted")?.order).toBe(1);
    expect(lead?.items.find((item) => item.key === "qualified")?.label).toBe(
      "Qualified",
    );
    expect(lead?.items.find((item) => item.key === "qualified")?.order).toBe(2);
    expect(lead?.items.find((item) => item.key === "lost")?.order).toBe(3);
    expect(
      lead?.items.find((item) => item.key === "called_no_answer"),
    ).toMatchObject({
      label: "Called — no answer / Call back required",
      color: "#EA580C",
      order: 2,
    });

    vi.mocked(findDictionaryByType).mockResolvedValue({
      id: "dict-lead_status",
      workspaceId: "ws-1",
      type: "lead_status",
      name: "Lead status",
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findDictionaryItemByTypeAndKey).mockImplementation(
      async (_workspaceId, _type, key) => {
        if (key === "called_no_answer") {
          return null;
        }
        return {
          id: `existing-${key}`,
          workspaceId: "ws-1",
          dictionaryId: "dict-lead_status",
          type: "lead_status",
          label: key,
          key,
          color: "#000000",
          order: 0,
          isDefault: false,
          isActive: true,
          isSystem: true,
          behavior: undefined,
          defaultProbability: undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    );

    const result = await ensureDefaultDictionaries("ws-1", "user-1");

    expect(result.itemsCreated).toBe(1);
    expect(createDictionaryItem).toHaveBeenCalledTimes(1);
    expect(createDictionaryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "called_no_answer",
        label: "Called — no answer / Call back required",
      }),
    );
  });
});
