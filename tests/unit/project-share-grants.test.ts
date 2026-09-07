import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/email/resend", () => ({
  sendCampaignEmail: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  getEnv: () => ({
    NEXT_PUBLIC_APP_URL: "https://crm.example.com",
  }),
}));

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

vi.mock("@/server/repositories/project-grants", () => ({
  findActiveProjectGrant: vi.fn(),
  createProjectGrant: vi.fn(),
  findProjectGrant: vi.fn(),
  reactivateProjectGrant: vi.fn(),
}));

vi.mock("@/server/repositories/project-invitations", () => ({
  createProjectInvitation: vi.fn(),
  findPendingInvitation: vi.fn(),
  findInvitationsForProject: vi.fn(),
  findInvitationByIdInProject: vi.fn(),
  findInvitationByTokenHash: vi.fn(),
  markInvitationAccepted: vi.fn(),
  revokeInvitation: vi.fn(),
  updateInvitationTokenForResend: vi.fn(),
}));

vi.mock("@/server/services/project-invitation-tokens", () => ({
  generateInvitationToken: () => ({ raw: "raw-token", hash: "hashed-token" }),
  hashInvitationToken: (token: string) => `hash:${token}`,
}));

import { sendCampaignEmail } from "@/server/email/resend";
import {
  createProjectGrant,
  findActiveProjectGrant,
} from "@/server/repositories/project-grants";
import {
  createProjectInvitation,
  findPendingInvitation,
} from "@/server/repositories/project-invitations";
import { findProjectById } from "@/server/repositories/projects";
import { findUserByEmail, findUserById } from "@/server/repositories/users";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import { sendProjectInvitation } from "@/server/services/project-invitations";

describe("sendProjectInvitation (email accept before grant)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findProjectById).mockResolvedValue({
      id: "proj-1",
      workspaceId: "ws-1",
      name: "Alpha",
      archivedAt: null,
    } as never);
    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: "ws-1",
      name: "Evo Workspace",
      slug: "evo",
    } as never);
    vi.mocked(findUserById).mockResolvedValue({
      id: "actor-1",
      email: "owner@example.com",
      name: "Owner",
    } as never);
    vi.mocked(findPendingInvitation).mockResolvedValue(null);
    vi.mocked(findActiveProjectGrant).mockResolvedValue(null);
    vi.mocked(sendCampaignEmail).mockResolvedValue({ success: true });
    vi.mocked(createProjectInvitation).mockResolvedValue({
      id: "inv-1",
      workspaceId: "ws-1",
      projectId: "proj-1",
      email: "teammate@example.com",
      projectRole: "contributor",
      status: "pending",
      invitedBy: "actor-1",
      expiresAt: new Date("2026-12-01"),
      acceptedAt: null,
      revokedAt: null,
      lastResentAt: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      message: null,
      tokenHash: "hashed-token",
    } as never);
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

  it("sends an invite email and does not create a grant on send", async () => {
    const result = await sendProjectInvitation({
      workspaceId: "ws-1",
      projectId: "proj-1",
      email: "teammate@example.com",
      projectRole: "contributor",
      actorId: "actor-1",
      actorProjectRole: "project_admin",
      isWorkspaceAdmin: false,
    });

    expect(result.invitation.email).toBe("teammate@example.com");
    expect(createProjectInvitation).toHaveBeenCalled();
    expect(sendCampaignEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "teammate@example.com",
        subject: expect.stringContaining("Alpha"),
      }),
    );
    const emailCall = vi.mocked(sendCampaignEmail).mock.calls[0]?.[0];
    expect(emailCall?.html).toContain("/invitations/accept?token=raw-token");
    expect(createProjectGrant).not.toHaveBeenCalled();
  });

  it("rejects unknown emails with a neutral account-not-found error", async () => {
    await expect(
      sendProjectInvitation({
        workspaceId: "ws-1",
        projectId: "proj-1",
        email: "unknown@example.com",
        projectRole: "viewer",
        actorId: "actor-1",
        actorProjectRole: "project_admin",
        isWorkspaceAdmin: true,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No EvoCRM account found for that email.",
    });
    expect(createProjectInvitation).not.toHaveBeenCalled();
    expect(sendCampaignEmail).not.toHaveBeenCalled();
  });

  it("blocks self-invite", async () => {
    await expect(
      sendProjectInvitation({
        workspaceId: "ws-1",
        projectId: "proj-1",
        email: "owner@example.com",
        projectRole: "viewer",
        actorId: "actor-1",
        actorProjectRole: "contributor",
        isWorkspaceAdmin: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("enforces role ceiling for non-admins", async () => {
    await expect(
      sendProjectInvitation({
        workspaceId: "ws-1",
        projectId: "proj-1",
        email: "teammate@example.com",
        projectRole: "project_admin",
        actorId: "actor-1",
        actorProjectRole: "contributor",
        isWorkspaceAdmin: false,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});
