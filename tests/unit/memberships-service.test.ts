import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/permissions/owner-protection", () => ({
  assertOwnerProtection: vi.fn(),
  assertRoleBelongsToWorkspace: vi.fn(),
}));

vi.mock("@/server/repositories/reassignment", () => ({
  countAssignedRecords: vi.fn(),
  hasAssignedRecords: vi.fn(),
}));

vi.mock("@/server/repositories/memberships", () => ({
  createMembership: vi.fn(),
  findMembership: vi.fn(),
  findMembershipByIdInWorkspace: vi.fn(),
  findMembershipsForWorkspace: vi.fn(),
  reactivateMembership: vi.fn(),
  updateMembership: vi.fn(),
}));

vi.mock("@/server/repositories/roles", () => ({
  findRoleByIdInWorkspace: vi.fn(),
}));

vi.mock("@/server/repositories/users", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
}));

import { addMembershipToWorkspace } from "@/server/services/memberships";
import {
  createMembership,
  findMembership,
  reactivateMembership,
} from "@/server/repositories/memberships";
import { findRoleByIdInWorkspace } from "@/server/repositories/roles";
import { findUserByEmail, findUserById } from "@/server/repositories/users";

describe("memberships service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reactivates a removed membership instead of creating a duplicate", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "user-2",
      email: "returning@example.com",
      name: "Returning User",
      authProvider: "credentials",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findMembership).mockResolvedValue({
      id: "m-removed",
      userId: "user-2",
      workspaceId: "ws-1",
      roleId: "role-agent",
      status: "removed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(reactivateMembership).mockResolvedValue({
      id: "m-removed",
      userId: "user-2",
      workspaceId: "ws-1",
      roleId: "role-agent",
      status: "active",
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findUserById).mockResolvedValue({
      id: "user-2",
      email: "returning@example.com",
      name: "Returning User",
      authProvider: "credentials",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findRoleByIdInWorkspace).mockResolvedValue({
      id: "role-agent",
      workspaceId: "ws-1",
      name: "Agent",
      key: "agent",
      permissions: ["lead:read"],
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await addMembershipToWorkspace({
      workspaceId: "ws-1",
      actorId: "user-1",
      data: {
        email: "returning@example.com",
        roleId: "role-agent",
      },
    });

    expect(reactivateMembership).toHaveBeenCalledWith({
      membershipId: "m-removed",
      workspaceId: "ws-1",
      roleId: "role-agent",
      invitedBy: "user-1",
    });
    expect(createMembership).not.toHaveBeenCalled();
    expect(result.status).toBe("active");
    expect(result.isOwnerRole).toBe(false);
  });
});
