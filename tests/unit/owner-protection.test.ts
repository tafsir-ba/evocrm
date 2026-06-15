import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertOwnerMembershipRemovable,
  requireWorkspaceOwner,
} from "@/server/permissions/owner-protection";

vi.mock("@/server/repositories/memberships", () => ({
  findMembership: vi.fn(),
  findMembershipByIdInWorkspace: vi.fn(),
  countActiveMembershipsWithRole: vi.fn(),
}));

vi.mock("@/server/repositories/roles", () => ({
  findRoleByWorkspaceAndKey: vi.fn(),
}));

import {
  countActiveMembershipsWithRole,
  findMembership,
  findMembershipByIdInWorkspace,
} from "@/server/repositories/memberships";
import { findRoleByWorkspaceAndKey } from "@/server/repositories/roles";

describe("owner protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks removal of last owner membership", async () => {
    vi.mocked(findMembershipByIdInWorkspace).mockResolvedValue({
      id: "m-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-owner",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(findRoleByWorkspaceAndKey).mockResolvedValue({
      id: "role-owner",
      workspaceId: "ws-1",
      name: "Owner",
      key: "owner",
      permissions: ["dashboard:read"],
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(countActiveMembershipsWithRole).mockResolvedValue(1);

    await expect(
      assertOwnerMembershipRemovable({
        workspaceId: "ws-1",
        membershipId: "m-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("requireWorkspaceOwner rejects non-owner members", async () => {
    vi.mocked(findMembership).mockResolvedValue({
      id: "m-2",
      userId: "user-2",
      workspaceId: "ws-1",
      roleId: "role-agent",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(findRoleByWorkspaceAndKey).mockResolvedValue({
      id: "role-owner",
      workspaceId: "ws-1",
      name: "Owner",
      key: "owner",
      permissions: ["dashboard:read"],
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(requireWorkspaceOwner("ws-1", "user-2")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("requireWorkspaceOwner allows active owners", async () => {
    vi.mocked(findMembership).mockResolvedValue({
      id: "m-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-owner",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(findRoleByWorkspaceAndKey).mockResolvedValue({
      id: "role-owner",
      workspaceId: "ws-1",
      name: "Owner",
      key: "owner",
      permissions: ["dashboard:read"],
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(requireWorkspaceOwner("ws-1", "user-1")).resolves.toBeUndefined();
  });

  it("allows removal of non-owner membership", async () => {
    vi.mocked(findMembershipByIdInWorkspace).mockResolvedValue({
      id: "m-2",
      userId: "user-2",
      workspaceId: "ws-1",
      roleId: "role-agent",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(findRoleByWorkspaceAndKey).mockResolvedValue({
      id: "role-owner",
      workspaceId: "ws-1",
      name: "Owner",
      key: "owner",
      permissions: ["dashboard:read"],
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      assertOwnerMembershipRemovable({
        workspaceId: "ws-1",
        membershipId: "m-2",
        userId: "user-2",
      }),
    ).resolves.toBeUndefined();
  });
});
