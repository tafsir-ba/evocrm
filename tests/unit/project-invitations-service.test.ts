import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn(),
}));

vi.mock("@/server/repositories/users", () => ({
  findUserById: vi.fn(),
  findUserByEmail: vi.fn(),
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
  findActiveProjectGrant: vi.fn(),
  createProjectGrant: vi.fn(),
  reactivateProjectGrant: vi.fn(),
  findProjectGrant: vi.fn(),
}));

vi.mock("@/server/repositories/project-invitations", () => ({
  createProjectInvitation: vi.fn(),
  findInvitationByIdInProject: vi.fn(),
  findInvitationByTokenHash: vi.fn(),
  findInvitationsForProject: vi.fn(),
  findPendingInvitation: vi.fn(),
  markInvitationAccepted: vi.fn(),
  revokeInvitation: vi.fn(),
  updateInvitationTokenForResend: vi.fn(),
}));

vi.mock("@/server/email/resend", () => ({
  sendCampaignEmail: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  getEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://crm.example.com" }),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/services/project-invitation-tokens", () => ({
  generateInvitationToken: () => ({ raw: "raw-token", hash: "hash-token" }),
  hashInvitationToken: (token: string) => `hash:${token}`,
}));

import { sendCampaignEmail } from "@/server/email/resend";
import { createMembership, findMembership } from "@/server/repositories/memberships";
import {
  createProjectGrant,
  findActiveProjectGrant,
  findProjectGrant,
} from "@/server/repositories/project-grants";
import {
  createProjectInvitation,
  findInvitationByTokenHash,
  findPendingInvitation,
  markInvitationAccepted,
} from "@/server/repositories/project-invitations";
import { findProjectById } from "@/server/repositories/projects";
import { findRoleByWorkspaceAndKey } from "@/server/repositories/roles";
import { findUserByEmail, findUserById } from "@/server/repositories/users";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import {
  acceptProjectInvitation,
  sendProjectInvitation,
} from "@/server/services/project-invitations";

const workspaceId = "ws-1";
const projectId = "proj-1";
const actorId = "user-actor";

describe("sendProjectInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findProjectById).mockResolvedValue({
      id: projectId,
      workspaceId,
      name: "Demo",
      archivedAt: null,
    } as never);
    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: workspaceId,
      name: "Acme",
      slug: "acme",
    } as never);
    vi.mocked(findUserById).mockResolvedValue({
      id: actorId,
      email: "actor@example.com",
      name: "Actor",
    } as never);
    vi.mocked(findPendingInvitation).mockResolvedValue(null);
    vi.mocked(findActiveProjectGrant).mockResolvedValue(null);
    vi.mocked(sendCampaignEmail).mockResolvedValue({ success: true });
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "user-target",
      email: "member@example.com",
      name: "Member",
    } as never);
    vi.mocked(createProjectInvitation).mockResolvedValue({
      id: "inv-1",
      workspaceId,
      projectId,
      email: "member@example.com",
      projectRole: "viewer",
      status: "pending",
      invitedBy: actorId,
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
      revokedAt: null,
      lastResentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
  });

  it("blocks self-invite", async () => {
    await expect(
      sendProjectInvitation({
        workspaceId,
        projectId,
        email: "actor@example.com",
        projectRole: "viewer",
        actorId,
        actorProjectRole: "project_admin",
        isWorkspaceAdmin: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("blocks duplicate pending invitations", async () => {
    vi.mocked(findPendingInvitation).mockResolvedValue({
      id: "inv-existing",
      status: "pending",
    } as never);

    await expect(
      sendProjectInvitation({
        workspaceId,
        projectId,
        email: "member@example.com",
        projectRole: "viewer",
        actorId,
        actorProjectRole: "contributor",
        isWorkspaceAdmin: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("enforces role ceiling for non-admin inviters", async () => {
    await expect(
      sendProjectInvitation({
        workspaceId,
        projectId,
        email: "member@example.com",
        projectRole: "project_admin",
        actorId,
        actorProjectRole: "contributor",
        isWorkspaceAdmin: false,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("allows workspace admins to assign any role via invite email", async () => {
    const result = await sendProjectInvitation({
      workspaceId,
      projectId,
      email: "member@example.com",
      projectRole: "project_admin",
      actorId,
      actorProjectRole: "viewer",
      isWorkspaceAdmin: true,
    });

    expect(result.invitation.email).toBe("member@example.com");
    expect(createProjectInvitation).toHaveBeenCalled();
    expect(sendCampaignEmail).toHaveBeenCalled();
    expect(createProjectGrant).not.toHaveBeenCalled();
  });

  it("still sends an invite (no grant) for existing active workspace members", async () => {
    vi.mocked(findMembership).mockResolvedValue({
      id: "mem-1",
      status: "active",
    } as never);

    const result = await sendProjectInvitation({
      workspaceId,
      projectId,
      email: "member@example.com",
      projectRole: "contributor",
      actorId,
      actorProjectRole: "project_admin",
      isWorkspaceAdmin: false,
    });

    expect(result.invitation.email).toBe("member@example.com");
    expect(createProjectInvitation).toHaveBeenCalled();
    expect(sendCampaignEmail).toHaveBeenCalled();
    expect(createProjectGrant).not.toHaveBeenCalled();
  });

  it("rejects unregistered emails", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);

    await expect(
      sendProjectInvitation({
        workspaceId,
        projectId,
        email: "unknown@example.com",
        projectRole: "viewer",
        actorId,
        actorProjectRole: "project_admin",
        isWorkspaceAdmin: true,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No EvoCRM account found for that email.",
    });
  });
});

describe("acceptProjectInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findInvitationByTokenHash).mockResolvedValue({
      id: "inv-1",
      workspaceId,
      projectId,
      email: "invitee@example.com",
      projectRole: "contributor",
      status: "pending",
      invitedBy: actorId,
      expiresAt: new Date(Date.now() + 86400000),
    } as never);
    vi.mocked(markInvitationAccepted).mockResolvedValue({
      id: "inv-1",
      status: "accepted",
    } as never);
    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: workspaceId,
      slug: "acme",
    } as never);
    vi.mocked(findRoleByWorkspaceAndKey).mockResolvedValue({
      id: "role-viewer",
      key: "viewer",
    } as never);
    vi.mocked(findProjectGrant).mockResolvedValue(null);
    vi.mocked(createProjectGrant).mockResolvedValue({
      id: "grant-1",
    } as never);
  });

  it("creates membership and grant for registered invitees after accept", async () => {
    vi.mocked(findMembership).mockResolvedValue(null);
    vi.mocked(createMembership).mockResolvedValue({
      id: "mem-new",
      status: "active",
    } as never);

    const result = await acceptProjectInvitation({
      token: "raw-token",
      userId: "user-new",
      userEmail: "invitee@example.com",
    });

    expect(createMembership).toHaveBeenCalled();
    expect(createProjectGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        projectId,
        userId: "user-new",
        projectRole: "contributor",
      }),
    );
    expect(result.workspaceSlug).toBe("acme");
    expect(result.projectId).toBe(projectId);
  });

  it("rejects when signed-in email does not match the invite", async () => {
    await expect(
      acceptProjectInvitation({
        token: "raw-token",
        userId: "user-other",
        userEmail: "other@example.com",
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(createProjectGrant).not.toHaveBeenCalled();
  });

  it("rejects suspended memberships", async () => {
    vi.mocked(findMembership).mockResolvedValue({
      id: "mem-1",
      status: "suspended",
    } as never);

    await expect(
      acceptProjectInvitation({
        token: "raw-token",
        userId: "user-1",
        userEmail: "invitee@example.com",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
