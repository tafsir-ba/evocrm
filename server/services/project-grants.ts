import "server-only";

import type { ProjectRoleKey } from "@/lib/project-sharing-roles";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  countActiveProjectAdmins,
  createProjectGrant,
  findActiveProjectGrant,
  findActiveProjectGrantsForProject,
  findProjectGrant,
  reactivateProjectGrant,
  revokeProjectGrant,
  updateProjectGrantRole,
  type ProjectGrantRecord,
} from "@/server/repositories/project-grants";
import { findProjectById } from "@/server/repositories/projects";
import { findUserById, findUserByEmail } from "@/server/repositories/users";
import {
  isProjectRoleKey,
  getProjectRoleDefinition,
} from "@/server/permissions/project-roles";

export type ProjectGrantListItem = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  projectRole: ProjectRoleKey;
  projectRoleName: string;
  status: ProjectGrantRecord["status"];
  grantedBy: string;
  createdAt: string;
  revokedAt: string | null;
};

async function toGrantListItem(grant: ProjectGrantRecord): Promise<ProjectGrantListItem> {
  const user = await findUserById(grant.userId);
  const roleDef = getProjectRoleDefinition(grant.projectRole);

  return {
    id: grant.id,
    userId: grant.userId,
    userName: user?.name ?? null,
    userEmail: user?.email ?? "unknown",
    projectRole: grant.projectRole,
    projectRoleName: roleDef.name,
    status: grant.status,
    grantedBy: grant.grantedBy,
    createdAt: grant.createdAt.toISOString(),
    revokedAt: grant.revokedAt?.toISOString() ?? null,
  };
}

export async function listProjectGrantsForProject(
  workspaceId: string,
  projectId: string,
): Promise<ProjectGrantListItem[]> {
  const grants = await findActiveProjectGrantsForProject(workspaceId, projectId);
  return Promise.all(grants.map(toGrantListItem));
}

export async function addProjectGrant(input: {
  workspaceId: string;
  projectId: string;
  targetEmail: string;
  projectRole: ProjectRoleKey;
  actorId: string;
}): Promise<ProjectGrantListItem> {
  if (!isProjectRoleKey(input.projectRole)) {
    throw new AppError("VALIDATION_ERROR", "Invalid project role.");
  }

  const project = await findProjectById(input.workspaceId, input.projectId);
  if (!project || project.archivedAt) {
    throw new AppError("NOT_FOUND", "Project not found or archived.");
  }

  const targetUser = await findUserByEmail(input.targetEmail);
  if (!targetUser) {
    throw new AppError(
      "NOT_FOUND",
      "No user account exists for this email. Use the invitation flow for new users.",
    );
  }

  const existing = await findProjectGrant(
    input.workspaceId,
    input.projectId,
    targetUser.id,
  );

  if (existing && existing.status === "active") {
    throw new AppError("CONFLICT", "This user already has an active project grant.");
  }

  let grant: ProjectGrantRecord;

  if (existing && existing.status === "removed") {
    const reactivated = await reactivateProjectGrant(
      input.workspaceId,
      input.projectId,
      targetUser.id,
      input.projectRole,
      input.actorId,
    );
    if (!reactivated) {
      throw new AppError("INTERNAL_ERROR", "Failed to reactivate project grant.");
    }
    grant = reactivated;
  } else {
    grant = await createProjectGrant({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      userId: targetUser.id,
      projectRole: input.projectRole,
      grantedBy: input.actorId,
    });
  }

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "project_grant.created",
    entityType: "project_grant",
    entityId: grant.id,
    after: {
      projectId: input.projectId,
      userId: targetUser.id,
      projectRole: input.projectRole,
    },
  });

  return toGrantListItem(grant);
}

export async function changeProjectGrantRole(input: {
  workspaceId: string;
  projectId: string;
  targetUserId: string;
  newRole: ProjectRoleKey;
  actorId: string;
}): Promise<ProjectGrantListItem> {
  if (!isProjectRoleKey(input.newRole)) {
    throw new AppError("VALIDATION_ERROR", "Invalid project role.");
  }

  const existing = await findActiveProjectGrant(
    input.workspaceId,
    input.projectId,
    input.targetUserId,
  );

  if (!existing) {
    throw new AppError("NOT_FOUND", "Active project grant not found.");
  }

  if (existing.projectRole === "project_admin" && input.newRole !== "project_admin") {
    const adminCount = await countActiveProjectAdmins(
      input.workspaceId,
      input.projectId,
    );
    if (adminCount <= 1) {
      throw new AppError(
        "CONFLICT",
        "Cannot demote the last Project Admin. Transfer admin role first.",
      );
    }
  }

  const updated = await updateProjectGrantRole(
    input.workspaceId,
    input.projectId,
    input.targetUserId,
    input.newRole,
  );

  if (!updated) {
    throw new AppError("INTERNAL_ERROR", "Failed to update project grant role.");
  }

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "project_grant.role_changed",
    entityType: "project_grant",
    entityId: updated.id,
    before: { projectRole: existing.projectRole },
    after: { projectRole: input.newRole },
  });

  return toGrantListItem(updated);
}

export async function removeProjectGrant(input: {
  workspaceId: string;
  projectId: string;
  targetUserId: string;
  actorId: string;
}): Promise<void> {
  const existing = await findActiveProjectGrant(
    input.workspaceId,
    input.projectId,
    input.targetUserId,
  );

  if (!existing) {
    throw new AppError("NOT_FOUND", "Active project grant not found.");
  }

  if (existing.projectRole === "project_admin") {
    const adminCount = await countActiveProjectAdmins(
      input.workspaceId,
      input.projectId,
    );
    if (adminCount <= 1) {
      throw new AppError(
        "CONFLICT",
        "Cannot remove the last Project Admin. Transfer admin role first.",
      );
    }
  }

  await revokeProjectGrant(
    input.workspaceId,
    input.projectId,
    input.targetUserId,
    input.actorId,
  );

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "project_grant.removed",
    entityType: "project_grant",
    entityId: existing.id,
    before: {
      projectId: input.projectId,
      userId: input.targetUserId,
      projectRole: existing.projectRole,
    },
  });
}
