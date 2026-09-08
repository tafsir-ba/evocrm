import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/memberships", () => ({
  findMembership: vi.fn(),
}));

vi.mock("@/server/repositories/roles", () => ({
  findRoleByIdInWorkspace: vi.fn(),
}));

vi.mock("@/server/repositories/project-grants", () => ({
  findActiveProjectGrant: vi.fn(),
  findActiveProjectGrantsForUser: vi.fn(),
}));

import { findMembership } from "@/server/repositories/memberships";
import {
  findActiveProjectGrant,
  findActiveProjectGrantsForUser,
} from "@/server/repositories/project-grants";
import { findRoleByIdInWorkspace } from "@/server/repositories/roles";
import {
  requireProjectAccess,
  resolveAllowedProjectIds,
  resolveWorkspaceAccess,
} from "@/server/permissions/resolve-workspace-access";

describe("project-grant-only workspace access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows resolveWorkspaceAccess via ProjectGrant without membership", async () => {
    vi.mocked(findMembership).mockResolvedValue(null);
    vi.mocked(findActiveProjectGrantsForUser).mockResolvedValue([
      {
        id: "g1",
        workspaceId: "ws-1",
        projectId: "proj-1",
        userId: "user-1",
        projectRole: "contributor",
        status: "active",
      },
    ] as never);

    const access = await resolveWorkspaceAccess("ws-1", "user-1");

    expect(access.mode).toBe("shared_project");
    expect(access.membership).toBeNull();
    expect(access.isWorkspaceAdmin).toBe(false);
    expect(access.grantedProjectIds).toEqual(["proj-1"]);
    expect(access.permissions).toContain("project:read");
    expect(access.permissions).toContain("lead:update");
    expect(access.permissions).not.toContain("users:manage");
    expect(access.permissions).not.toContain("settings:read");
  });

  it("grant-only Project Admin does not receive settings:read or workspace admin permissions", async () => {
    vi.mocked(findMembership).mockResolvedValue(null);
    vi.mocked(findActiveProjectGrantsForUser).mockResolvedValue([
      {
        id: "g1",
        workspaceId: "ws-1",
        projectId: "proj-1",
        userId: "user-1",
        projectRole: "project_admin",
        status: "active",
      },
    ] as never);

    const access = await resolveWorkspaceAccess("ws-1", "user-1");

    expect(access.mode).toBe("shared_project");
    expect(access.permissions).not.toContain("settings:read");
    expect(access.permissions).not.toContain("settings:update");
    expect(access.permissions).not.toContain("users:manage");
    expect(access.permissions).not.toContain("roles:manage");
    expect(access.permissions).not.toContain("billing:manage");
    expect(access.permissions).not.toContain("project:create");
    expect(access.permissions).toContain("project:update");
  });


  it("authorize requireProjectAccess from grant alone", async () => {
    vi.mocked(findMembership).mockResolvedValue(null);
    vi.mocked(findActiveProjectGrantsForUser).mockResolvedValue([
      {
        id: "g1",
        workspaceId: "ws-1",
        projectId: "proj-1",
        userId: "user-1",
        projectRole: "viewer",
        status: "active",
      },
    ] as never);
    vi.mocked(findActiveProjectGrant).mockResolvedValue({
      id: "g1",
      projectRole: "viewer",
      status: "active",
    } as never);

    const access = await requireProjectAccess("ws-1", "user-1", "proj-1", "lead:read");

    expect(access.accessMode).toBe("shared_project");
    expect(access.membership).toBeNull();
    expect(access.projectRole).toBe("viewer");
    expect(access.effectivePermissions).toContain("lead:read");
    expect(access.effectivePermissions).not.toContain("lead:update");
  });

  it("resolveAllowedProjectIds returns grant ids for grant-only users", async () => {
    vi.mocked(findMembership).mockResolvedValue(null);
    vi.mocked(findActiveProjectGrantsForUser).mockResolvedValue([
      { projectId: "proj-a", projectRole: "viewer", status: "active" },
      { projectId: "proj-b", projectRole: "contributor", status: "active" },
    ] as never);

    await expect(resolveAllowedProjectIds("ws-1", "user-1")).resolves.toEqual([
      "proj-a",
      "proj-b",
    ]);
  });

  it("keeps workspace admins on full access without grants", async () => {
    vi.mocked(findMembership).mockResolvedValue({
      id: "mem-1",
      workspaceId: "ws-1",
      userId: "admin-1",
      roleId: "role-owner",
      status: "active",
      permissions: ["project:read", "users:manage", "settings:update"],
    } as never);
    vi.mocked(findRoleByIdInWorkspace).mockResolvedValue({
      id: "role-owner",
      key: "owner",
    } as never);

    const access = await resolveWorkspaceAccess("ws-1", "admin-1");
    expect(access.isWorkspaceAdmin).toBe(true);
    expect(access.grantedProjectIds).toBeNull();
    await expect(resolveAllowedProjectIds("ws-1", "admin-1")).resolves.toBeNull();
  });

  it("rejects users with neither membership nor grants", async () => {
    vi.mocked(findMembership).mockResolvedValue(null);
    vi.mocked(findActiveProjectGrantsForUser).mockResolvedValue([]);

    await expect(resolveWorkspaceAccess("ws-1", "user-1")).rejects.toMatchObject({
      code: "MEMBERSHIP_REQUIRED",
    });
  });
});
