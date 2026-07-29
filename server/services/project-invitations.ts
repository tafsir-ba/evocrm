import "server-only";

import type { ProjectRoleKey } from "@/lib/project-sharing-roles";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { getEnv } from "@/server/env";
import { sendCampaignEmail } from "@/server/email/resend";
import {
  createProjectInvitation,
  findInvitationByIdInProject,
  findInvitationByTokenHash,
  findInvitationsForProject,
  findPendingInvitation,
  markInvitationAccepted,
  revokeInvitation,
  updateInvitationTokenForResend,
  type ProjectInvitationRecord,
} from "@/server/repositories/project-invitations";
import {
  findActiveProjectGrant,
  createProjectGrant,
  reactivateProjectGrant,
  findProjectGrant,
} from "@/server/repositories/project-grants";
import { findProjectById } from "@/server/repositories/projects";
import { findUserByEmail, findUserById } from "@/server/repositories/users";
import { findMembership, createMembership } from "@/server/repositories/memberships";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import {
  generateInvitationToken,
  hashInvitationToken,
} from "@/server/services/project-invitation-tokens";
import {
  isProjectRoleKey,
  getProjectRoleDefinition,
} from "@/server/permissions/project-roles";

const INVITATION_EXPIRY_DAYS = 7;

function getExpiryDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + INVITATION_EXPIRY_DAYS);
  return date;
}

export type InvitationListItem = {
  id: string;
  email: string;
  projectRole: ProjectRoleKey;
  projectRoleName: string;
  status: ProjectInvitationRecord["status"];
  invitedByName: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastResentAt: string | null;
  createdAt: string;
};

async function toInvitationListItem(
  inv: ProjectInvitationRecord,
): Promise<InvitationListItem> {
  const inviter = await findUserById(inv.invitedBy);
  const roleDef = getProjectRoleDefinition(inv.projectRole);

  return {
    id: inv.id,
    email: inv.email,
    projectRole: inv.projectRole,
    projectRoleName: roleDef.name,
    status: inv.status,
    invitedByName: inviter?.name ?? inviter?.email ?? null,
    expiresAt: inv.expiresAt.toISOString(),
    acceptedAt: inv.acceptedAt?.toISOString() ?? null,
    revokedAt: inv.revokedAt?.toISOString() ?? null,
    lastResentAt: inv.lastResentAt?.toISOString() ?? null,
    createdAt: inv.createdAt.toISOString(),
  };
}

export async function listProjectInvitations(
  workspaceId: string,
  projectId: string,
): Promise<InvitationListItem[]> {
  const invitations = await findInvitationsForProject(workspaceId, projectId);
  return Promise.all(invitations.map(toInvitationListItem));
}

export async function sendProjectInvitation(input: {
  workspaceId: string;
  projectId: string;
  email: string;
  projectRole: ProjectRoleKey;
  actorId: string;
  message?: string;
}): Promise<
  | { mode: "invitation"; invitation: InvitationListItem; isExistingMember: boolean }
  | { mode: "grant"; grant: Awaited<ReturnType<typeof import("@/server/services/project-grants").addProjectGrant>> }
> {
  if (!isProjectRoleKey(input.projectRole)) {
    throw new AppError("VALIDATION_ERROR", "Invalid project role.");
  }

  const project = await findProjectById(input.workspaceId, input.projectId);
  if (!project || project.archivedAt) {
    throw new AppError("NOT_FOUND", "Project not found or archived.");
  }

  const workspace = await findWorkspaceById(input.workspaceId);
  if (!workspace) {
    throw new AppError("NOT_FOUND", "Workspace not found.");
  }

  const normalizedEmail = input.email.toLowerCase().trim();

  const existingUser = await findUserByEmail(normalizedEmail);
  const existingGrant = existingUser
    ? await findActiveProjectGrant(input.workspaceId, input.projectId, existingUser.id)
    : null;

  if (existingGrant) {
    throw new AppError(
      "CONFLICT",
      "This user already has access to this project.",
    );
  }

  const existingPending = await findPendingInvitation(
    input.workspaceId,
    input.projectId,
    normalizedEmail,
  );
  if (existingPending) {
    throw new AppError(
      "CONFLICT",
      "A pending invitation already exists for this email. Resend or revoke it first.",
    );
  }

  const activeMembership = existingUser
    ? await findMembership(existingUser.id, input.workspaceId)
    : null;

  if (existingUser && activeMembership?.status === "active") {
    const { addProjectGrant } = await import("@/server/services/project-grants");
    const grant = await addProjectGrant({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      targetEmail: normalizedEmail,
      projectRole: input.projectRole,
      actorId: input.actorId,
    });

    return {
      mode: "grant",
      grant,
    };
  }

  const { raw: token, hash: tokenHash } = generateInvitationToken();
  const expiresAt = getExpiryDate();

  const invitation = await createProjectInvitation({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    email: normalizedEmail,
    projectRole: input.projectRole,
    tokenHash,
    expiresAt,
    invitedBy: input.actorId,
    message: input.message,
  });

  const inviter = await findUserById(input.actorId);
  const roleDef = getProjectRoleDefinition(input.projectRole);
  const env = getEnv();
  const acceptUrl = `${env.NEXT_PUBLIC_APP_URL}/invitations/accept?token=${token}`;

  const sendResult = await sendCampaignEmail({
    to: normalizedEmail,
    subject: `${inviter?.name ?? "Someone"} invited you to collaborate on ${project.name}`,
    html: buildInvitationEmailHtml({
      inviterName: inviter?.name ?? inviter?.email ?? "A team member",
      workspaceName: workspace.name,
      projectName: project.name,
      roleName: roleDef.name,
      roleDescription: roleDef.description,
      message: input.message,
      acceptUrl,
      expiresAt,
    }),
    text: buildInvitationEmailText({
      inviterName: inviter?.name ?? inviter?.email ?? "A team member",
      workspaceName: workspace.name,
      projectName: project.name,
      roleName: roleDef.name,
      acceptUrl,
      expiresAt,
    }),
    fromName: workspace.name,
  });

  if (!sendResult.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      `Could not send invitation email: ${sendResult.error}`,
    );
  }

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "project_invitation.sent",
    entityType: "project_invitation",
    entityId: invitation.id,
    after: {
      projectId: input.projectId,
      email: normalizedEmail,
      projectRole: input.projectRole,
    },
  });

  return {
    mode: "invitation",
    invitation: await toInvitationListItem(invitation),
    isExistingMember: Boolean(existingUser),
  };
}

export async function resendProjectInvitation(input: {
  workspaceId: string;
  projectId: string;
  invitationId: string;
  actorId: string;
}): Promise<InvitationListItem> {
  const existing = await findInvitationByIdInProject(
    input.workspaceId,
    input.projectId,
    input.invitationId,
  );

  if (!existing || existing.status !== "pending") {
    throw new AppError("NOT_FOUND", "Pending invitation not found.");
  }

  const { raw: token, hash: tokenHash } = generateInvitationToken();
  const expiresAt = getExpiryDate();

  const updated = await updateInvitationTokenForResend(
    input.invitationId,
    tokenHash,
    expiresAt,
  );

  if (!updated) {
    throw new AppError("NOT_FOUND", "Pending invitation not found.");
  }

  const project = await findProjectById(input.workspaceId, updated.projectId);
  const workspace = await findWorkspaceById(input.workspaceId);
  const inviter = await findUserById(input.actorId);
  const roleDef = getProjectRoleDefinition(updated.projectRole);
  const env = getEnv();
  const acceptUrl = `${env.NEXT_PUBLIC_APP_URL}/invitations/accept?token=${token}`;

  await sendCampaignEmail({
    to: updated.email,
    subject: `Reminder: ${inviter?.name ?? "Someone"} invited you to collaborate on ${project?.name ?? "a project"}`,
    html: buildInvitationEmailHtml({
      inviterName: inviter?.name ?? inviter?.email ?? "A team member",
      workspaceName: workspace?.name ?? "a workspace",
      projectName: project?.name ?? "a project",
      roleName: roleDef.name,
      roleDescription: roleDef.description,
      acceptUrl,
      expiresAt,
    }),
    text: buildInvitationEmailText({
      inviterName: inviter?.name ?? inviter?.email ?? "A team member",
      workspaceName: workspace?.name ?? "a workspace",
      projectName: project?.name ?? "a project",
      roleName: roleDef.name,
      acceptUrl,
      expiresAt,
    }),
    fromName: workspace?.name ?? "EvoHome",
  });

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "project_invitation.resent",
    entityType: "project_invitation",
    entityId: updated.id,
    after: { email: updated.email },
  });

  return toInvitationListItem(updated);
}

export async function revokeProjectInvitation(input: {
  workspaceId: string;
  projectId: string;
  invitationId: string;
  actorId: string;
}): Promise<void> {
  const existing = await findInvitationByIdInProject(
    input.workspaceId,
    input.projectId,
    input.invitationId,
  );

  if (!existing || existing.status !== "pending") {
    throw new AppError("NOT_FOUND", "Pending invitation not found.");
  }

  const revoked = await revokeInvitation(input.invitationId, input.actorId);

  if (!revoked) {
    throw new AppError("NOT_FOUND", "Pending invitation not found.");
  }

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "project_invitation.revoked",
    entityType: "project_invitation",
    entityId: revoked.id,
    after: { email: revoked.email, projectId: revoked.projectId },
  });
}

export async function acceptProjectInvitation(input: {
  token: string;
  userId: string;
  userEmail: string;
}): Promise<{
  workspaceId: string;
  projectId: string;
  projectRole: ProjectRoleKey;
}> {
  const tokenHash = hashInvitationToken(input.token);
  const invitation = await findInvitationByTokenHash(tokenHash);

  if (!invitation) {
    throw new AppError("NOT_FOUND", "Invitation not found or already used.");
  }

  if (invitation.status !== "pending") {
    throw new AppError(
      "CONFLICT",
      `This invitation has already been ${invitation.status}.`,
    );
  }

  if (invitation.expiresAt < new Date()) {
    throw new AppError("CONFLICT", "This invitation has expired.");
  }

  if (invitation.email !== input.userEmail.toLowerCase().trim()) {
    throw new AppError(
      "PERMISSION_DENIED",
      "This invitation was sent to a different email address. Sign in with the invited email.",
    );
  }

  const accepted = await markInvitationAccepted(invitation.id, input.userId);
  if (!accepted) {
    throw new AppError("CONFLICT", "Invitation could not be accepted. It may have been revoked.");
  }

  let membership = await findMembership(input.userId, invitation.workspaceId);

  if (!membership || membership.status === "removed") {
    const { findRoleByWorkspaceAndKey } = await import("@/server/repositories/roles");
    const viewerRole = await findRoleByWorkspaceAndKey(invitation.workspaceId, "viewer");

    if (!viewerRole) {
      throw new AppError("INTERNAL_ERROR", "Could not resolve workspace viewer role.");
    }

    if (membership?.status === "removed") {
      const { reactivateMembership } = await import("@/server/repositories/memberships");
      membership = await reactivateMembership({
        membershipId: membership.id,
        workspaceId: invitation.workspaceId,
        roleId: viewerRole.id,
        invitedBy: invitation.invitedBy,
      });
    } else {
      membership = await createMembership({
        userId: input.userId,
        workspaceId: invitation.workspaceId,
        roleId: viewerRole.id,
        status: "active",
        invitedBy: invitation.invitedBy,
        joinedAt: new Date(),
      });
    }
  }

  const existingGrant = await findProjectGrant(
    invitation.workspaceId,
    invitation.projectId,
    input.userId,
  );

  if (existingGrant && existingGrant.status === "active") {
    return {
      workspaceId: invitation.workspaceId,
      projectId: invitation.projectId,
      projectRole: existingGrant.projectRole,
    };
  }

  if (existingGrant && existingGrant.status === "removed") {
    await reactivateProjectGrant(
      invitation.workspaceId,
      invitation.projectId,
      input.userId,
      invitation.projectRole,
      invitation.invitedBy,
    );
  } else {
    await createProjectGrant({
      workspaceId: invitation.workspaceId,
      projectId: invitation.projectId,
      userId: input.userId,
      projectRole: invitation.projectRole,
      grantedBy: invitation.invitedBy,
    });
  }

  await createAuditLog({
    workspaceId: invitation.workspaceId,
    actorId: input.userId,
    action: "project_invitation.accepted",
    entityType: "project_invitation",
    entityId: invitation.id,
    after: {
      projectId: invitation.projectId,
      projectRole: invitation.projectRole,
    },
  });

  return {
    workspaceId: invitation.workspaceId,
    projectId: invitation.projectId,
    projectRole: invitation.projectRole,
  };
}

function buildInvitationEmailHtml(input: {
  inviterName: string;
  workspaceName: string;
  projectName: string;
  roleName: string;
  roleDescription: string;
  message?: string | null;
  acceptUrl: string;
  expiresAt: Date;
}): string {
  const messageBlock = input.message
    ? `<p style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #e5e5e5; color: #333;">"${input.message.replace(/</g, "&lt;")}"</p>`
    : "";

  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #111; max-width: 560px;">
      <p><strong>${input.inviterName.replace(/</g, "&lt;")}</strong> has invited you to collaborate on <strong>${input.projectName.replace(/</g, "&lt;")}</strong> in the <strong>${input.workspaceName.replace(/</g, "&lt;")}</strong> workspace.</p>
      <p>Your role: <strong>${input.roleName}</strong> — ${input.roleDescription}</p>
      ${messageBlock}
      <p style="margin: 24px 0;">
        <a href="${input.acceptUrl}" style="background: #2563eb; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Accept invitation</a>
      </p>
      <p style="font-size: 13px; color: #666;">This invitation expires on ${input.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>
      <p style="margin-top: 24px;">Best regards,<br />The EvoHome Team</p>
    </div>
  `.trim();
}

function buildInvitationEmailText(input: {
  inviterName: string;
  workspaceName: string;
  projectName: string;
  roleName: string;
  acceptUrl: string;
  expiresAt: Date;
}): string {
  return [
    `${input.inviterName} has invited you to collaborate on "${input.projectName}" in the ${input.workspaceName} workspace.`,
    "",
    `Your role: ${input.roleName}`,
    "",
    `Accept the invitation: ${input.acceptUrl}`,
    "",
    `This invitation expires on ${input.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`,
    "",
    "Best regards,",
    "The EvoHome Team",
  ].join("\n");
}
