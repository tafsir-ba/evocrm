import "server-only";

import type { ProjectRoleKey } from "@/lib/project-sharing-roles";
import { AppError } from "@/server/errors";
import type { PermissionKey } from "@/server/permissions/permissions";
import {
  getProjectRolePermissions,
  resolveEffectiveProjectPermissions,
} from "@/server/permissions/project-roles";
import type { WorkspaceMembership } from "@/server/permissions/types";
import {
  findActiveProjectGrant,
  findActiveProjectGrantsForUser,
} from "@/server/repositories/project-grants";
import { findMembership } from "@/server/repositories/memberships";
import { findRoleByIdInWorkspace } from "@/server/repositories/roles";
import {
  getDefaultRolePermissions,
  isSystemRoleKey,
} from "@/server/permissions/roles";

const WORKSPACE_ADMIN_ROLE_KEYS = new Set(["owner", "admin"]);

/** Permissions that require active workspace membership — never granted via ProjectGrant alone. */
export const WORKSPACE_WIDE_PERMISSIONS = [
  "settings:read",
  "settings:update",
  "users:manage",
  "roles:manage",
  "billing:manage",
  "project:create",
] as const satisfies readonly PermissionKey[];

const WORKSPACE_WIDE_PERMISSION_SET = new Set<string>(WORKSPACE_WIDE_PERMISSIONS);

export function isWorkspaceWidePermission(permission: string): boolean {
  return WORKSPACE_WIDE_PERMISSION_SET.has(permission);
}

export function filterProjectScopedPermissions(
  permissions: readonly PermissionKey[],
): PermissionKey[] {
  return permissions.filter((permission) => !isWorkspaceWidePermission(permission));
}

export type WorkspaceAccessMode = "member" | "shared_project";

export type ResolvedWorkspaceAccess = {
  mode: WorkspaceAccessMode;
  membership: WorkspaceMembership | null;
  permissions: PermissionKey[];
  isWorkspaceAdmin: boolean;
  /** Active grant project IDs when not a workspace admin. */
  grantedProjectIds: string[] | null;
};

function uniquePermissions(permissions: PermissionKey[]): PermissionKey[] {
  return Array.from(new Set(permissions));
}

async function toWorkspaceMembership(
  membership: NonNullable<Awaited<ReturnType<typeof findMembership>>>,
): Promise<WorkspaceMembership> {
  const role = await findRoleByIdInWorkspace(membership.roleId, membership.workspaceId);
  if (!role) {
    throw new AppError("INTERNAL_ERROR", "Membership role not found.", {
      expose: false,
    });
  }

  const permissions =
    role.isSystem && isSystemRoleKey(role.key)
      ? getDefaultRolePermissions(role.key)
      : role.permissions;

  return {
    id: membership.id,
    workspaceId: membership.workspaceId,
    userId: membership.userId,
    roleId: membership.roleId,
    status: membership.status,
    permissions,
  };
}

async function isWorkspaceAdminMembership(
  membership: WorkspaceMembership,
): Promise<boolean> {
  const role = await findRoleByIdInWorkspace(membership.roleId, membership.workspaceId);
  return role !== null && WORKSPACE_ADMIN_ROLE_KEYS.has(role.key);
}

/**
 * Resolve how a user may access a workspace.
 * - Active members: normal membership permissions (admins bypass project grants).
 * - Non-members with ProjectGrant(s): project-only access; permissions come from grants.
 * - Otherwise: MEMBERSHIP_REQUIRED.
 */
export async function resolveWorkspaceAccess(
  workspaceId: string,
  userId: string,
): Promise<ResolvedWorkspaceAccess> {
  const rawMembership = await findMembership(userId, workspaceId);

  if (rawMembership?.status === "suspended") {
    throw new AppError(
      "FORBIDDEN",
      "Your workspace membership is suspended.",
    );
  }

  if (rawMembership?.status === "active") {
    const membership = await toWorkspaceMembership(rawMembership);
    const isWorkspaceAdmin = await isWorkspaceAdminMembership(membership);
    if (isWorkspaceAdmin) {
      return {
        mode: "member",
        membership,
        permissions: membership.permissions as PermissionKey[],
        isWorkspaceAdmin: true,
        grantedProjectIds: null,
      };
    }

    const grants = await findActiveProjectGrantsForUser(workspaceId, userId);
    return {
      mode: "member",
      membership,
      permissions: membership.permissions as PermissionKey[],
      isWorkspaceAdmin: false,
      grantedProjectIds: grants.map((grant) => grant.projectId),
    };
  }

  const grants = await findActiveProjectGrantsForUser(workspaceId, userId);
  if (grants.length === 0) {
    throw new AppError("MEMBERSHIP_REQUIRED", "Workspace membership required.");
  }

  const permissions = filterProjectScopedPermissions(
    uniquePermissions(
      grants.flatMap((grant) => getProjectRolePermissions(grant.projectRole)),
    ),
  );

  return {
    mode: "shared_project",
    membership: null,
    permissions,
    isWorkspaceAdmin: false,
    grantedProjectIds: grants.map((grant) => grant.projectId),
  };
}

export type ProjectAccessContext = {
  membership: WorkspaceMembership | null;
  accessMode: WorkspaceAccessMode;
  projectId: string;
  projectRole: ProjectRoleKey;
  effectivePermissions: PermissionKey[];
  isWorkspaceAdmin: boolean;
};

export async function requireProjectAccess(
  workspaceId: string,
  userId: string,
  projectId: string,
  permission?: PermissionKey,
): Promise<ProjectAccessContext> {
  const access = await resolveWorkspaceAccess(workspaceId, userId);

  if (access.isWorkspaceAdmin) {
    if (permission && !access.permissions.includes(permission)) {
      throw new AppError("PERMISSION_DENIED", "Permission denied.");
    }

    return {
      membership: access.membership,
      accessMode: access.mode,
      projectId,
      projectRole: "project_admin",
      effectivePermissions: access.permissions,
      isWorkspaceAdmin: true,
    };
  }

  const grant = await findActiveProjectGrant(workspaceId, projectId, userId);
  if (!grant) {
    throw new AppError("PERMISSION_DENIED", "You do not have access to this project.");
  }

  const effectivePermissions = filterProjectScopedPermissions(
    access.mode === "shared_project" || !access.membership
      ? getProjectRolePermissions(grant.projectRole)
      : resolveEffectiveProjectPermissions(
          access.membership.permissions,
          grant.projectRole,
        ),
  );

  if (permission && isWorkspaceWidePermission(permission) && access.mode === "shared_project") {
    throw new AppError(
      "PERMISSION_DENIED",
      "Project sharing does not grant workspace administration access.",
    );
  }

  if (permission && !effectivePermissions.includes(permission)) {
    throw new AppError("PERMISSION_DENIED", "Permission denied.");
  }

  return {
    membership: access.membership,
    accessMode: access.mode,
    projectId,
    projectRole: grant.projectRole,
    effectivePermissions,
    isWorkspaceAdmin: false,
  };
}

/**
 * Resolve the list of project IDs a user may access in a workspace.
 * Workspace owners/admins get null (= all projects).
 * Members and grant-only collaborators get their active grant project IDs.
 */
export async function resolveAllowedProjectIds(
  workspaceId: string,
  userId: string,
): Promise<string[] | null> {
  const access = await resolveWorkspaceAccess(workspaceId, userId);
  if (access.isWorkspaceAdmin) {
    return null;
  }
  return access.grantedProjectIds ?? [];
}
