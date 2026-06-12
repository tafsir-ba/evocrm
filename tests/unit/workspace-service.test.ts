import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateUniqueWorkspaceSlug } from "@/server/services/workspaces";

vi.mock("@/server/repositories/workspaces", () => ({
  slugExists: vi.fn(),
  createWorkspace: vi.fn(),
  findWorkspaceBySlug: vi.fn(),
  findWorkspaceById: vi.fn(),
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

import { slugExists } from "@/server/repositories/workspaces";
import { createOwnerMembership } from "@/server/services/memberships";
import { seedDefaultRolesForWorkspace } from "@/server/services/roles";
import { ensureDefaultDictionaries } from "@/server/services/default-dictionaries";
import { createWorkspaceForUser } from "@/server/services/workspaces";

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
});
