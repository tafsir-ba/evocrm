import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("@/server/repositories/users", () => ({
  findUserById: vi.fn(),
  findUserByEmail: vi.fn(),
}));

vi.mock("@/server/repositories/memberships", () => ({
  findMembership: vi.fn(),
  createMembership: vi.fn(),
  reactivateMembership: vi.fn(),
}));

vi.mock("@/server/repositories/roles", () => ({
  findRoleByWorkspaceAndKey: vi.fn(),
}));

vi.mock("@/server/repositories/project-grants", () => ({
  countActiveProjectAdmins: vi.fn(),
  createProjectGrant: vi.fn(),
  findActiveProjectGrant: vi.fn(),
  findActiveProjectGrantsForProject: vi.fn(),
  findProjectGrant: vi.fn(),
  reactivateProjectGrant: vi.fn(),
  revokeProjectGrant: vi.fn(),
  updateProjectGrantRole: vi.fn(),
}));

import { findProjectById } from "@/server/repositories/projects";
import { findUserByEmail, findUserById } from "@/server/repositories/users";
import { findMembership, createMembership } from "@/server/repositories/memberships";
import { findRoleByWorkspaceAndKey } from "@/server/repositories/roles";
import {
  createProjectGrant,
  findProjectGrant,
} from "@/server/repositories/project-grants";
import { shareProjectWithRegisteredUser } from "@/server/services/project-grants";
import { AppError } from "@/server/errors";

describe("shareProjectWithRegisteredUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findProjectById).mockResolvedValue({
      id: "proj-1",
      workspaceId: "ws-1",
      name: "Alpha",
      archivedAt: null,
    } as never);
    vi.mocked(findUserById).mockImplementation(async (id: string) => {
      if (id === "user-2") {
        return {
          id: "user-2",
          email: "teammate@example.com",
          name: "Teammate",
        } as never;
      }
      return {
        id: "actor-1",
        email: "owner@example.com",
        name: "Owner",
      } as never;
    });
    vi.mocked(findMembership).mockResolvedValue({
      id: "mem-1",
      status: "active",
    } as never);
    vi.mocked(findProjectGrant).mockResolvedValue(null);
    vi.mocked(createProjectGrant).mockResolvedValue({
      id: "grant-1",
      workspaceId: "ws-1",
      projectId: "proj-1",
      userId: "user-2",
      projectRole: "contributor",
      status: "active",
      grantedBy: "actor-1",
      revokedBy: null,
      revokedAt: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });
    vi.mocked(findUserByEmail).mockImplementation(async (email: string) => {
      if (email === "teammate@example.com") {
        return {
          id: "user-2",
          email: "teammate@example.com",
          name: "Teammate",
        } as never;
      }
      return null;
    });
  });

  it("grants access immediately for a registered user", async () => {
    const grant = await shareProjectWithRegisteredUser({
      workspaceId: "ws-1",
      projectId: "proj-1",
      targetEmail: "teammate@example.com",
      projectRole: "contributor",
      actorId: "actor-1",
      actorProjectRole: "project_admin",
      isWorkspaceAdmin: false,
    });

    expect(grant.userEmail).toBe("teammate@example.com");
    expect(createProjectGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-2",
        projectRole: "contributor",
      }),
    );
    expect(createMembership).not.toHaveBeenCalled();
  });

  it("returns a plain message when the email is not registered", async () => {
    await expect(
      shareProjectWithRegisteredUser({
        workspaceId: "ws-1",
        projectId: "proj-1",
        targetEmail: "unknown@example.com",
        projectRole: "viewer",
        actorId: "actor-1",
        actorProjectRole: "project_admin",
        isWorkspaceAdmin: true,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No EvoCRM account found for that email.",
    } satisfies Partial<AppError>);
  });

  it("blocks self-share", async () => {
    await expect(
      shareProjectWithRegisteredUser({
        workspaceId: "ws-1",
        projectId: "proj-1",
        targetEmail: "owner@example.com",
        projectRole: "viewer",
        actorId: "actor-1",
        actorProjectRole: "contributor",
        isWorkspaceAdmin: false,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "You already have access to this project.",
    });
  });

  it("enforces role ceiling for non-admins", async () => {
    await expect(
      shareProjectWithRegisteredUser({
        workspaceId: "ws-1",
        projectId: "proj-1",
        targetEmail: "teammate@example.com",
        projectRole: "project_admin",
        actorId: "actor-1",
        actorProjectRole: "contributor",
        isWorkspaceAdmin: false,
      }),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });

  it("adds workspace viewer membership when the user is not a member yet", async () => {
    vi.mocked(findMembership).mockResolvedValue(null);
    vi.mocked(findRoleByWorkspaceAndKey).mockResolvedValue({
      id: "role-viewer",
      key: "viewer",
    } as never);

    await shareProjectWithRegisteredUser({
      workspaceId: "ws-1",
      projectId: "proj-1",
      targetEmail: "teammate@example.com",
      projectRole: "viewer",
      actorId: "actor-1",
      actorProjectRole: "project_admin",
      isWorkspaceAdmin: false,
    });

    expect(createMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-2",
        roleId: "role-viewer",
        status: "active",
      }),
    );
  });
});
