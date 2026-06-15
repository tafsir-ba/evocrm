import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/server/errors";
import { requireMembership } from "@/server/permissions/require-membership";

vi.mock("@/server/repositories/memberships", () => ({
  findMembership: vi.fn(),
}));

vi.mock("@/server/repositories/roles", () => ({
  findRoleByIdInWorkspace: vi.fn(),
}));

import { findMembership } from "@/server/repositories/memberships";
import { findRoleByIdInWorkspace } from "@/server/repositories/roles";

describe("requireMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing membership", async () => {
    vi.mocked(findMembership).mockResolvedValue(null);

    await expect(requireMembership("ws-1", "user-1")).rejects.toMatchObject({
      code: "MEMBERSHIP_REQUIRED",
    });
  });

  it("rejects inactive membership statuses", async () => {
    vi.mocked(findMembership).mockResolvedValue({
      id: "m-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "suspended",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(requireMembership("ws-1", "user-1")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns active membership with role permissions", async () => {
    vi.mocked(findMembership).mockResolvedValue({
      id: "m-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active",
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(findRoleByIdInWorkspace).mockResolvedValue({
      id: "role-1",
      workspaceId: "ws-1",
      name: "Agent",
      key: "agent",
      permissions: ["dashboard:read"],
      isSystem: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const membership = await requireMembership("ws-1", "user-1");

    expect(findRoleByIdInWorkspace).toHaveBeenCalledWith("role-1", "ws-1");
    expect(membership.permissions).toEqual(["dashboard:read"]);
    expect(membership.status).toBe("active");
  });

  it("uses canonical permissions for system roles", async () => {
    vi.mocked(findMembership).mockResolvedValue({
      id: "m-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active",
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(findRoleByIdInWorkspace).mockResolvedValue({
      id: "role-1",
      workspaceId: "ws-1",
      name: "Owner",
      key: "owner",
      permissions: ["dashboard:read"],
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const membership = await requireMembership("ws-1", "user-1");

    expect(membership.permissions).toContain("campaign:delete");
    expect(membership.permissions).toContain("campaign:archive");
  });

  it("throws internal error when role is missing", async () => {
    vi.mocked(findMembership).mockResolvedValue({
      id: "m-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-1",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findRoleByIdInWorkspace).mockResolvedValue(null);

    await expect(requireMembership("ws-1", "user-1")).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
