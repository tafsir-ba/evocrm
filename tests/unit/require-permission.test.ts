import { beforeEach, describe, expect, it, vi } from "vitest";

import { requirePermission } from "@/server/permissions/require-permission";

vi.mock("@/server/permissions/require-membership", () => ({
  requireMembership: vi.fn(),
}));

import { requireMembership } from "@/server/permissions/require-membership";

describe("requirePermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing permission", async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      id: "m-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active",
      permissions: ["dashboard:read"],
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

    vi.mocked(requireMembership).mockResolvedValue(membership);

    const result = await requirePermission("ws-1", "user-1", "lead:read");

    expect(result.membership).toEqual(membership);
  });
});
