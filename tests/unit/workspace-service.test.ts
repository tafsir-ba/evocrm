import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateUniqueWorkspaceSlug } from "@/server/services/workspaces";

vi.mock("@/lib/project-sharing-feature", () => ({
  PROJECT_SHARING_ENABLED: true,
}));

vi.mock("@/server/repositories/workspaces", () => ({
  slugExists: vi.fn(),
  createWorkspace: vi.fn(),
  findWorkspaceBySlug: vi.fn(),
  findWorkspaceById: vi.fn(),
}));

vi.mock("@/server/repositories/memberships", () => ({
  findActiveMembershipsForUser: vi.fn(),
}));

vi.mock("@/server/repositories/roles", () => ({
  findRoleByIdInWorkspace: vi.fn(),
}));

vi.mock("@/server/repositories/project-grants", () => ({
  findActiveProjectGrantsAcrossWorkspaces: vi.fn(),
}));

vi.mock("@/server/services/roles", () => ({
  seedDefaultRolesForWorkspace: vi.fn(),
  findOwnerRole: vi.fn(),
}));

vi.mock("@/server/services/default-dictionaries", () => ({
  ensureDefaultDictionaries: vi.fn(),
}));

vi.mock("@/server/services/memberships", () => ({
  createOwnerMembership: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { slugExists, findWorkspaceById } from "@/server/repositories/workspaces";
import { findActiveMembershipsForUser } from "@/server/repositories/memberships";
import { findRoleByIdInWorkspace } from "@/server/repositories/roles";
import { findActiveProjectGrantsAcrossWorkspaces } from "@/server/repositories/project-grants";
import { createOwnerMembership } from "@/server/services/memberships";
import { seedDefaultRolesForWorkspace } from "@/server/services/roles";
import { ensureDefaultDictionaries } from "@/server/services/default-dictionaries";
import {
  createWorkspaceForUser,
  listActiveWorkspacesForUser,
} from "@/server/services/workspaces";

describe("workspace service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generateUniqueWorkspaceSlug avoids collisions", async () => {
    vi.mocked(slugExists)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const slug = await generateUniqueWorkspaceSlug("EvoHome CRM");

    expect(slug).toBe("evohome-crm-2");
  });

  it("createWorkspaceForUser seeds roles and owner membership", async () => {
    vi.mocked(slugExists).mockResolvedValue(false);

    const { createWorkspace } = await import("@/server/repositories/workspaces");
    vi.mocked(createWorkspace).mockResolvedValue({
      id: "ws-1",
      name: "EvoHome CRM",
      slug: "evohome-crm",
      type: "agency",
      timezone: "UTC",
      defaultCurrency: "USD",
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(seedDefaultRolesForWorkspace).mockResolvedValue([
      {
        id: "role-owner",
        workspaceId: "ws-1",
        name: "Owner",
        key: "owner",
        permissions: ["dashboard:read"],
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const workspace = await createWorkspaceForUser("user-1", {
      name: "EvoHome CRM",
      type: "agency",
      timezone: "UTC",
      defaultCurrency: "USD",
    });

    expect(workspace.slug).toBe("evohome-crm");
    expect(seedDefaultRolesForWorkspace).toHaveBeenCalledWith("ws-1", "user-1");
    expect(createOwnerMembership).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "ws-1",
      roleId: "role-owner",
    });
    expect(ensureDefaultDictionaries).toHaveBeenCalledWith("ws-1", "user-1");
  });

  it("listActiveWorkspacesForUser includes grant-only shared workspaces", async () => {
    vi.mocked(findActiveMembershipsForUser).mockResolvedValue([]);
    vi.mocked(findActiveProjectGrantsAcrossWorkspaces).mockResolvedValue([
      {
        id: "g1",
        workspaceId: "ws-shared",
        projectId: "proj-gv",
        userId: "user-maelle",
        projectRole: "contributor",
        status: "active",
        grantedBy: "owner-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        revokedAt: null,
        revokedBy: null,
      },
    ] as never);
    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: "ws-shared",
      name: "Evo CRM",
      slug: "evo-crm",
      type: "agency",
      timezone: "Europe/Zurich",
      defaultCurrency: "CHF",
      createdBy: "owner-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const workspaces = await listActiveWorkspacesForUser("user-maelle");

    expect(workspaces).toEqual([
      expect.objectContaining({
        id: "ws-shared",
        slug: "evo-crm",
        roleKey: "shared_project",
        isOwner: false,
        canEdit: false,
      }),
    ]);
    expect(findRoleByIdInWorkspace).not.toHaveBeenCalled();
  });

  it("listActiveWorkspacesForUser does not duplicate membership workspaces via grants", async () => {
    vi.mocked(findActiveMembershipsForUser).mockResolvedValue([
      {
        id: "mem-1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-agent",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);
    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: "ws-1",
      name: "Evo CRM",
      slug: "evo-crm",
      type: "agency",
      timezone: "UTC",
      defaultCurrency: "USD",
      createdBy: "owner-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(findRoleByIdInWorkspace).mockResolvedValue({
      id: "role-agent",
      key: "agent",
      permissions: ["lead:read"],
    } as never);
    vi.mocked(findActiveProjectGrantsAcrossWorkspaces).mockResolvedValue([
      {
        id: "g1",
        workspaceId: "ws-1",
        projectId: "proj-gv",
        userId: "user-1",
        projectRole: "contributor",
        status: "active",
      },
    ] as never);

    const workspaces = await listActiveWorkspacesForUser("user-1");

    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]?.roleKey).toBe("agent");
  });
});
