import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@/server/permissions/require-permission", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/server/services/dictionaries", () => ({
  listDictionariesForWorkspace: vi.fn(),
}));

import { GET as getDictionaries } from "@/app/api/workspaces/[workspaceSlug]/dictionaries/route";
import { POST as postDictionaryItem } from "@/app/api/workspaces/[workspaceSlug]/dictionary-items/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import { listDictionariesForWorkspace } from "@/server/services/dictionaries";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

describe("dictionary API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns UNAUTHENTICATED when not logged in", async () => {
    vi.mocked(requireAuth).mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Authentication required."),
    );

    const response = await getDictionaries(
      new Request("http://localhost/api/workspaces/demo/dictionaries"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns dictionaries for settings:read member", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "USD",
    });
    vi.mocked(requirePermission).mockResolvedValue({
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["settings:read"],
      },
    });
    vi.mocked(listDictionariesForWorkspace).mockResolvedValue([
      {
        id: "d1",
        workspaceId: "ws-1",
        type: "lead_status",
        name: "Lead status",
        isSystem: true,
        itemCount: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const response = await getDictionaries(
      new Request("http://localhost/api/workspaces/demo/dictionaries"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.dictionaries).toHaveLength(1);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "settings:read");
  });

  it("returns PERMISSION_DENIED without settings:read", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "USD",
    });
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await getDictionaries(
      new Request("http://localhost/api/workspaces/demo/dictionaries"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
  });

  it("returns PERMISSION_DENIED for dictionary item POST without settings:update", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-1", email: "a@b.com" },
    });
    vi.mocked(resolveWorkspace).mockResolvedValue({
      id: "ws-1",
      slug: "demo",
      name: "Demo",
      timezone: "UTC",
      defaultCurrency: "USD",
    });
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await postDictionaryItem(
      new Request("http://localhost/api/workspaces/demo/dictionary-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dictionaryId: "dict-1",
          type: "lead_source",
          label: "Partner",
          key: "partner",
          color: "#3B82F6",
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "settings:update");
  });
});
