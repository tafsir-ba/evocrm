import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

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

vi.mock("@/server/services/memberships", () => ({
  listMembershipsForWorkspace: vi.fn(),
}));

vi.mock("@/server/services/roles", () => ({
  listRolesForWorkspace: vi.fn(),
  getPermissionGroups: vi.fn(),
}));

vi.mock("@/server/services/workspace-settings", () => ({
  getWorkspaceSettings: vi.fn(),
}));

vi.mock("@/server/services/members", () => ({
  listWorkspaceMembersForWorkspace: vi.fn(),
}));

vi.mock("@/server/services/billing", () => ({
  getBillingShell: vi.fn(),
}));

import { GET as getMemberships } from "@/app/api/workspaces/[workspaceSlug]/memberships/route";
import { GET as getRoles } from "@/app/api/workspaces/[workspaceSlug]/roles/route";
import { GET as getSettings } from "@/app/api/workspaces/[workspaceSlug]/settings/route";
import { GET as getMembers } from "@/app/api/workspaces/[workspaceSlug]/members/route";
import { GET as getBilling } from "@/app/api/workspaces/[workspaceSlug]/billing/route";
import { requireAuth } from "@/server/auth/require-auth";
import { getProjectRolePermissions } from "@/server/permissions/project-roles";
import { requirePermission } from "@/server/permissions/require-permission";
import {
  WORKSPACE_WIDE_PERMISSIONS,
  filterProjectScopedPermissions,
  requireProjectAccess,
  resolveWorkspaceAccess,
} from "@/server/permissions/resolve-workspace-access";
import { findMembership } from "@/server/repositories/memberships";
import {
  findActiveProjectGrant,
  findActiveProjectGrantsForUser,
} from "@/server/repositories/project-grants";
import { listMembershipsForWorkspace } from "@/server/services/memberships";
import { listRolesForWorkspace, getPermissionGroups } from "@/server/services/roles";
import { getWorkspaceSettings } from "@/server/services/workspace-settings";
import { listWorkspaceMembersForWorkspace } from "@/server/services/members";
import { getBillingShell } from "@/server/services/billing";
import {
  requireWorkspaceApiAccess,
  requireWorkspaceMemberApiAccess,
} from "@/server/workspaces/require-workspace-api-access";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";

const workspace = {
  id: "ws-1",
  slug: "acme",
  name: "Acme",
  timezone: "UTC",
  defaultCurrency: "USD",
};

async function stubGrantOnlyProjectAdmin() {
  vi.mocked(findMembership).mockResolvedValue(null);
  vi.mocked(findActiveProjectGrantsForUser).mockResolvedValue([
    {
      id: "g1",
      workspaceId: "ws-1",
      projectId: "proj-shared",
      userId: "grant-user",
      projectRole: "project_admin",
      status: "active",
    },
  ] as never);
  vi.mocked(findActiveProjectGrant).mockResolvedValue({
    id: "g1",
    projectRole: "project_admin",
    status: "active",
  } as never);
}

describe("grant-only Project Admin workspace boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("project_admin role never includes workspace-wide permissions", () => {
    const permissions = getProjectRolePermissions("project_admin");
    for (const permission of WORKSPACE_WIDE_PERMISSIONS) {
      expect(permissions).not.toContain(permission);
    }
    expect(permissions).not.toContain("settings:read");
  });

  it("filterProjectScopedPermissions strips workspace-wide keys", () => {
    expect(
      filterProjectScopedPermissions([
        "lead:read",
        "settings:read",
        "users:manage",
        "project:create",
        "dashboard:read",
      ]),
    ).toEqual(["lead:read", "dashboard:read"]);
  });

  it("resolveWorkspaceAccess for grant-only Project Admin excludes workspace-wide permissions", async () => {
    await stubGrantOnlyProjectAdmin();

    const access = await resolveWorkspaceAccess("ws-1", "grant-user");

    expect(access.mode).toBe("shared_project");
    expect(access.membership).toBeNull();
    expect(access.grantedProjectIds).toEqual(["proj-shared"]);
    for (const permission of WORKSPACE_WIDE_PERMISSIONS) {
      expect(access.permissions).not.toContain(permission);
    }
    expect(access.permissions).toContain("project:update");
    expect(access.permissions).toContain("lead:read");
  });

  it("requirePermission denies settings:read for grant-only Project Admin", async () => {
    await stubGrantOnlyProjectAdmin();

    await expect(
      requirePermission("ws-1", "grant-user", "settings:read"),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("requireWorkspaceApiAccess rejects workspace-wide permission for grant-only", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "grant-user", email: "grant@example.com" },
    } as never);
    vi.mocked(resolveWorkspace).mockResolvedValue(workspace);
    await stubGrantOnlyProjectAdmin();

    await expect(
      requireWorkspaceApiAccess("acme", "settings:read"),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("requireWorkspaceMemberApiAccess always denies grant-only callers", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "grant-user", email: "grant@example.com" },
    } as never);
    vi.mocked(resolveWorkspace).mockResolvedValue(workspace);
    await stubGrantOnlyProjectAdmin();

    await expect(requireWorkspaceMemberApiAccess("acme")).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: "Active workspace membership is required.",
    });
  });

  it("requireProjectAccess still allows exact shared project for grant-only Project Admin", async () => {
    await stubGrantOnlyProjectAdmin();

    const access = await requireProjectAccess(
      "ws-1",
      "grant-user",
      "proj-shared",
      "project:update",
    );

    expect(access.accessMode).toBe("shared_project");
    expect(access.projectRole).toBe("project_admin");
    expect(access.effectivePermissions).toContain("project:update");
    expect(access.effectivePermissions).not.toContain("settings:read");
  });

  it("requireProjectAccess rejects settings:read even with Project Admin grant", async () => {
    await stubGrantOnlyProjectAdmin();

    await expect(
      requireProjectAccess("ws-1", "grant-user", "proj-shared", "settings:read"),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

describe("grant-only Project Admin cannot read workspace-wide API data", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "grant-user", email: "grant@example.com" },
    } as never);
    vi.mocked(resolveWorkspace).mockResolvedValue(workspace);
    await stubGrantOnlyProjectAdmin();
  });

  it("GET memberships returns 403 and does not list data", async () => {
    const response = await getMemberships(
      new Request("http://localhost/api/workspaces/acme/memberships"),
      { params: Promise.resolve({ workspaceSlug: "acme" }) },
    );

    expect(response.status).toBe(403);
    expect(listMembershipsForWorkspace).not.toHaveBeenCalled();
  });

  it("GET roles returns 403 and does not list data", async () => {
    const response = await getRoles(
      new Request("http://localhost/api/workspaces/acme/roles"),
      { params: Promise.resolve({ workspaceSlug: "acme" }) },
    );

    expect(response.status).toBe(403);
    expect(listRolesForWorkspace).not.toHaveBeenCalled();
    expect(getPermissionGroups).not.toHaveBeenCalled();
  });

  it("GET settings returns 403 and does not load workspace settings", async () => {
    const response = await getSettings(
      new Request("http://localhost/api/workspaces/acme/settings"),
      { params: Promise.resolve({ workspaceSlug: "acme" }) },
    );

    expect(response.status).toBe(403);
    expect(getWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("GET members returns 403 and does not list members", async () => {
    const response = await getMembers(
      new Request("http://localhost/api/workspaces/acme/members"),
      { params: Promise.resolve({ workspaceSlug: "acme" }) },
    );

    expect(response.status).toBe(403);
    expect(listWorkspaceMembersForWorkspace).not.toHaveBeenCalled();
  });

  it("GET billing returns 403 and does not load billing overview", async () => {
    const response = await getBilling(
      new Request("http://localhost/api/workspaces/acme/billing"),
      { params: Promise.resolve({ workspaceSlug: "acme" }) },
    );

    expect(response.status).toBe(403);
    expect(getBillingShell).not.toHaveBeenCalled();
  });
});
