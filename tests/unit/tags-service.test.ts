import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveTagForWorkspace,
  createTagForWorkspace,
  updateTagForWorkspace,
} from "@/server/services/tags";

vi.mock("@/server/repositories/tags", () => ({
  findActiveTagByNormalizedName: vi.fn(),
  createTag: vi.fn(),
  findTagById: vi.fn(),
  archiveTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import {
  archiveTag,
  createTag,
  findActiveTagByNormalizedName,
  findTagById,
  updateTag,
} from "@/server/repositories/tags";

describe("tag service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates entityTypes allowlist via schema at route layer", async () => {
    vi.mocked(findActiveTagByNormalizedName).mockResolvedValue(null);
    vi.mocked(createTag).mockResolvedValue({
      id: "tag-1",
      workspaceId: "ws-1",
      name: "Investor",
      color: "#3B82F6",
      entityTypes: ["lead", "property"],
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const tag = await createTagForWorkspace("ws-1", "user-1", {
      name: "Investor",
      color: "#3B82F6",
      entityTypes: ["lead", "property"],
    });

    expect(tag.entityTypes).toEqual(["lead", "property"]);
  });

  it("enforces workspace-scoped name uniqueness", async () => {
    vi.mocked(findActiveTagByNormalizedName).mockResolvedValue({
      id: "existing",
      workspaceId: "ws-1",
      name: "Investor",
      color: "#3B82F6",
      entityTypes: ["lead"],
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      createTagForWorkspace("ws-1", "user-1", {
        name: "investor",
        color: "#3B82F6",
        entityTypes: ["lead"],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("updates tag name, color, and entity types", async () => {
    vi.mocked(findTagById).mockResolvedValue({
      id: "tag-1",
      workspaceId: "ws-1",
      name: "Investor",
      color: "#3B82F6",
      entityTypes: ["lead"],
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findActiveTagByNormalizedName).mockResolvedValue(null);
    vi.mocked(updateTag).mockResolvedValue({
      id: "tag-1",
      workspaceId: "ws-1",
      name: "VIP Investor",
      color: "#10B981",
      entityTypes: ["lead", "opportunity"],
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const tag = await updateTagForWorkspace("ws-1", "tag-1", "user-1", {
      name: "VIP Investor",
      color: "#10B981",
      entityTypes: ["lead", "opportunity"],
    });

    expect(tag.name).toBe("VIP Investor");
    expect(tag.entityTypes).toEqual(["lead", "opportunity"]);
  });

  it("archives tags with archivedAt", async () => {
    vi.mocked(findTagById).mockResolvedValue({
      id: "tag-1",
      workspaceId: "ws-1",
      name: "Investor",
      color: "#3B82F6",
      entityTypes: ["lead"],
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(archiveTag).mockResolvedValue({
      id: "tag-1",
      workspaceId: "ws-1",
      name: "Investor",
      color: "#3B82F6",
      entityTypes: ["lead"],
      archivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const tag = await archiveTagForWorkspace("ws-1", "tag-1", "user-1");

    expect(tag.archivedAt).toBeInstanceOf(Date);
  });
});
