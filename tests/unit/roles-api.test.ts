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

vi.mock("@/server/services/roles", () => ({
  listRolesForWorkspace: vi.fn(),
  createCustomRole: vi.fn(),
  getPermissionGroups: vi.fn(),
}));

import { GET as getRoles } from "@/app/api/workspaces/[workspaceSlug]/roles/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import { getPermissionGroups, listRolesForWorkspace } from "@/server/services/roles";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";

describe("roles API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists roles with settings:read", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
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
        permissions: ["settings:read", "roles:manage"],
      },
    });
    vi.mocked(listRolesForWorkspace).mockResolvedValue([
      {
        id: "role-owner",
        name: "Owner",
        key: "owner",
        permissions: ["settings:read"],
        isSystem: true,
        memberCount: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    vi.mocked(getPermissionGroups).mockReturnValue([
      { module: "settings", permissions: [{ key: "settings:read", label: "View settings" }] },
    ]);

    const response = await getRoles(
      new Request("http://localhost/api/workspaces/demo/roles"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.roles[0].isSystem).toBe(true);
    expect(body.data.canManage).toBe(true);
  });

  it("denies role creation without roles:manage", async () => {
    const { POST: postRole } = await import(
      "@/app/api/workspaces/[workspaceSlug]/roles/route"
    );

    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
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

    const response = await postRole(
      new Request("http://localhost/api/workspaces/demo/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Custom",
          key: "custom",
          permissions: ["lead:read"],
        }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
  });
});
