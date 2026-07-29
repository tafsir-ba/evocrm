import "server-only";

import { AppError } from "@/server/errors";
import type { PermissionKey } from "@/server/permissions/permissions";
import {
  resolveEffectiveProjectPermissions,
  type ProjectRoleKey,
} from "@/server/permissions/project-roles";
import { requireMembership } from "@/server/permissions/require-membership";
import {
  findActiveProjectGrant,
  findActiveProjectGrantsForUser,
} from "@/server/repositories/project-grants";
import type { WorkspaceMembership } from "@/server/permissions/types";
import { isSystemRoleKey } from "@/server/permissions/roles";

export type ProjectAccessContext = {
  membership: WorkspaceMembership;
  projectId: string;
  projectRole: ProjectRoleKey;
  effectivePermissions: PermissionKey[];
  isWorkspaceAdmin: boolean;
};

/**
 * Workspace owners and admins bypass project grants (they see all projects).
 * Other users need an active project grant.
 */
const WORKSPACE_ADMIN_ROLE_KEYS = new Set(["owner", "admin"]);

function isWorkspaceAdminRole(membership: WorkspaceMembership): boolean {
  return WORKSPACE_ADMIN_ROLE_KEYS.has(
    membership.permissions.includes("users:manage") &&
    membership.permissions.includes("settings:update")
      ? "admin"
      : "",
  );
}

async function resolveWorkspaceAdminBypass(
  membership: WorkspaceMembership,
): Promise<boolean> {
  const roleKey = await resolveRoleKeyForMembership(membership);
  return roleKey !== null && WORKSPACE_ADMIN_ROLE_KEYS.has(roleKey);
}

async function resolveRoleKeyForMembership(
  membership: WorkspaceMembership,
): Promise<string | null> {
  const { findRoleByIdInWorkspace } = await import("@/server/repositories/roles");
  const role = await findRoleByIdInWorkspace(membership.roleId, membership.workspaceId);
  return role?.key ?? null;
}

export async function requireProjectAccess(
  workspaceId: string,
  userId: string,
  projectId: string,
  permission?: PermissionKey,
): Promise<ProjectAccessContext> {
  const membership = await requireMembership(workspaceId, userId);

  const isAdmin = await resolveWorkspaceAdminBypass(membership);

  if (isAdmin) {
    if (permission && !membership.permissions.includes(permission)) {
      throw new AppError("PERMISSION_DENIED", "Permission denied.");
    }

    return {
      membership,
      projectId,
      projectRole: "project_admin",
      effectivePermissions: membership.permissions as PermissionKey[],
      isWorkspaceAdmin: true,
    };
  }

  const grant = await findActiveProjectGrant(workspaceId, projectId, userId);

  if (!grant) {
    throw new AppError("PERMISSION_DENIED", "You do not have access to this project.");
  }

  const effectivePermissions = resolveEffectiveProjectPermissions(
    membership.permissions,
    grant.projectRole,
  );

  if (permission && !effectivePermissions.includes(permission)) {
    throw new AppError("PERMISSION_DENIED", "Permission denied.");
  }

  return {
    membership,
    projectId,
    projectRole: grant.projectRole,
    effectivePermissions,
    isWorkspaceAdmin: false,
  };
}

/**
 * Resolve the list of project IDs a user may access.
 * Workspace owners/admins get null (= all projects).
 * Others get their active grant project IDs.
 */
export async function resolveAllowedProjectIds(
  workspaceId: string,
  userId: string,
): Promise<string[] | null> {
  const membership = await requireMembership(workspaceId, userId);
  const isAdmin = await resolveWorkspaceAdminBypass(membership);

  if (isAdmin) {
    return null;
  }

  const grants = await findActiveProjectGrantsForUser(workspaceId, userId);
  return grants.map((g) => g.projectId);
}
