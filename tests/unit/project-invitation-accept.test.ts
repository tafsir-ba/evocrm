import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/repositories/project-invitations", () => ({
  findInvitationByTokenHash: vi.fn(),
  markInvitationAccepted: vi.fn(),
}));

vi.mock("@/server/repositories/memberships", () => ({
  findMembership: vi.fn(),
  createMembership: vi.fn(),
  reactivateMembership: vi.fn(),
  updateMembership: vi.fn(),
}));

vi.mock("@/server/repositories/roles", () => ({
  findRoleByWorkspaceAndKey: vi.fn(),
}));

vi.mock("@/server/repositories/project-grants", () => ({
  findProjectGrant: vi.fn(),
  createProjectGrant: vi.fn(),
  reactivateProjectGrant: vi.fn(),
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn(),
}));

vi.mock("@/server/services/project-invitation-tokens", () => ({
  hashInvitationToken: (token: string) => `hash:${token}`,
}));

import { createMembership, findMembership } from "@/server/repositories/memberships";
import {
  createProjectGrant,
  findProjectGrant,
} from "@/server/repositories/project-grants";
import {
  findInvitationByTokenHash,
  markInvitationAccepted,
} from "@/server/repositories/project-invitations";
import { findRoleByWorkspaceAndKey } from "@/server/repositories/roles";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { acceptProjectInvitation } from "@/server/services/project-invitations";

describe("acceptProjectInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findInvitationByTokenHash).mockResolvedValue({
      id: "inv-1",
      workspaceId: "ws-1",
      projectId: "proj-1",
      email: "teammate@example.com",
      projectRole: "contributor",
      status: "pending",
      invitedBy: "actor-1",
      expiresAt: new Date(Date.now() + 86_400_000),
      acceptedAt: null,
      revokedAt: null,
      lastResentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      message: null,
      tokenHash: "hash:token",
    } as never);
    vi.mocked(markInvitationAccepted).mockResolvedValue({
      id: "inv-1",
      status: "accepted",
    } as never);
    vi.mocked(findMembership).mockResolvedValue({
      id: "mem-1",
      status: "active",
    } as never);
    vi.mocked(findProjectGrant).mockResolvedValue(null);
    vi.mocked(createProjectGrant).mockResolvedValue({
      id: "grant-1",
      projectRole: "contributor",
    } as never);
    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: "ws-1",
      slug: "evo",
    } as never);
  });

  it("creates a ProjectGrant only after authenticated accept with matching email", async () => {
    const result = await acceptProjectInvitation({
      token: "token",
      userId: "user-2",
      userEmail: "teammate@example.com",
    });

    expect(result.workspaceSlug).toBe("evo");
    expect(createProjectGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-2",
        projectId: "proj-1",
        projectRole: "contributor",
      }),
    );
  });

  it("rejects when signed-in email does not match the invite", async () => {
    await expect(
      acceptProjectInvitation({
        token: "token",
        userId: "user-other",
        userEmail: "other@example.com",
      }),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: expect.stringContaining("different email"),
    });
    expect(createProjectGrant).not.toHaveBeenCalled();
  });

  it("adds workspace membership when the invitee is not yet a member", async () => {
    vi.mocked(findMembership).mockResolvedValue(null);
    vi.mocked(findRoleByWorkspaceAndKey).mockResolvedValue({
      id: "role-viewer",
      key: "viewer",
    } as never);

    await acceptProjectInvitation({
      token: "token",
      userId: "user-2",
      userEmail: "teammate@example.com",
    });

    expect(createMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-2",
        roleId: "role-viewer",
        status: "active",
      }),
    );
    expect(createProjectGrant).toHaveBeenCalled();
  });
});
