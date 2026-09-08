import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/permissions/resolve-workspace-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/permissions/resolve-workspace-access")>();
  return {
    ...actual,
    resolveWorkspaceAccess: vi.fn(),
  };
});

import { requirePermission } from "@/server/permissions/require-permission";
import { resolveWorkspaceAccess } from "@/server/permissions/resolve-workspace-access";

describe("requirePermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing permission", async () => {
    vi.mocked(resolveWorkspaceAccess).mockResolvedValue({
      mode: "member",
      membership: {
        id: "m-1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["dashboard:read"],
      },
      permissions: ["dashboard:read"],
      isWorkspaceAdmin: false,
      grantedProjectIds: [],
    });

    await expect(
      requirePermission("ws-1", "user-1", "settings:update"),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });

  it("rejects invalid permission keys", async () => {
    await expect(
      requirePermission("ws-1", "user-1", "fake:permission"),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it("returns authorized context when permission exists", async () => {
    const membership = {
      id: "m-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active" as const,
      permissions: ["dashboard:read", "lead:read"],
    };

    vi.mocked(resolveWorkspaceAccess).mockResolvedValue({
      mode: "member",
      membership,
      permissions: ["dashboard:read", "lead:read"],
      isWorkspaceAdmin: false,
      grantedProjectIds: [],
    });

    const result = await requirePermission("ws-1", "user-1", "lead:read");

    expect(result.membership).toEqual(membership);
    expect(result.accessMode).toBe("member");
  });

  it("rejects workspace-wide permission for grant-only callers", async () => {
    vi.mocked(resolveWorkspaceAccess).mockResolvedValue({
      mode: "shared_project",
      membership: null,
      permissions: ["lead:read", "project:update"],
      isWorkspaceAdmin: false,
      grantedProjectIds: ["proj-1"],
    });

    await expect(
      requirePermission("ws-1", "user-1", "settings:read"),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });
});
