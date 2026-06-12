import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/models/dictionary-item", () => ({
  DictionaryItemModel: {
    find: vi.fn(),
  },
}));

import { DictionaryItemModel } from "@/models/dictionary-item";
import { findDictionaryItems } from "@/server/repositories/dictionary-items";

describe("dictionary items repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes inactive items by default", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const sort = vi.fn().mockReturnValue({ lean });
    vi.mocked(DictionaryItemModel.find).mockReturnValue({ sort } as never);

    await findDictionaryItems("ws-1", { type: "lead_status" });

    expect(DictionaryItemModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      type: "lead_status",
      isActive: true,
    });
  });

  it("includes inactive items when includeInactive is true", async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const sort = vi.fn().mockReturnValue({ lean });
    vi.mocked(DictionaryItemModel.find).mockReturnValue({ sort } as never);

    await findDictionaryItems("ws-1", {
      type: "lead_status",
      includeInactive: true,
    });

    expect(DictionaryItemModel.find).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      type: "lead_status",
    });
    expect(DictionaryItemModel.find).not.toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true }),
    );
  });
});
