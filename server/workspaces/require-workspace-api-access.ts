import "server-only";

import { requireAuth } from "@/server/auth/require-auth";
import { AppError } from "@/server/errors";
import {
  hasPermission,
  type PermissionKey,
} from "@/server/permissions/permissions";
import {
  isWorkspaceWidePermission,
  resolveWorkspaceAccess,
} from "@/server/permissions/resolve-workspace-access";
import type { WorkspaceMembership } from "@/server/permissions/types";
import { resolveWorkspace, type ResolvedWorkspace } from "@/server/workspaces/resolve-workspace";

export type WorkspaceApiContext = {
  userId: string;
  workspace: ResolvedWorkspace;
  /** Null when the caller has project-grant-only access (no workspace membership). */
  membership: WorkspaceMembership | null;
  permissions: PermissionKey[];
  accessMode: "member" | "shared_project";
  isWorkspaceAdmin: boolean;
};

export type WorkspaceMemberApiContext = WorkspaceApiContext & {
  membership: WorkspaceMembership;
  accessMode: "member";
};

function assertPermissionAllowed(
  permissions: PermissionKey[],
  permission?: PermissionKey | PermissionKey[],
): void {
  if (!permission) {
    return;
  }
  const required = Array.isArray(permission) ? permission : [permission];
  const allowed = required.some((key) => hasPermission(permissions, key));
  if (!allowed) {
    throw new AppError("PERMISSION_DENIED", "Permission denied.");
  }
}

/**
 * Allow active members or project-grant-only collaborators.
 * Workspace-wide permissions (settings/users/roles/billing) are rejected for grant-only callers.
 */
export async function requireWorkspaceApiAccess(
  workspaceSlug: string,
  permission?: PermissionKey | PermissionKey[],
): Promise<WorkspaceApiContext> {
  const session = await requireAuth();
  const workspace = await resolveWorkspace(workspaceSlug);
  const access = await resolveWorkspaceAccess(workspace.id, session.user.id);

  if (permission) {
    const required = Array.isArray(permission) ? permission : [permission];
    if (
      access.mode === "shared_project" &&
      required.some((key) => isWorkspaceWidePermission(key))
    ) {
      throw new AppError(
        "PERMISSION_DENIED",
        "Project sharing does not grant workspace administration access.",
      );
    }
  }

  assertPermissionAllowed(access.permissions, permission);

  return {
    userId: session.user.id,
    workspace,
    membership: access.membership,
    permissions: access.permissions,
    accessMode: access.mode,
    isWorkspaceAdmin: access.isWorkspaceAdmin,
  };
}

/**
 * Require an active WorkspaceMembership. Use for workspace-wide data
 * (settings, memberships, roles, integrations, billing, dictionaries, etc.).
 * Project-grant-only collaborators are always denied.
 */
export async function requireWorkspaceMemberApiAccess(
  workspaceSlug: string,
  permission?: PermissionKey | PermissionKey[],
): Promise<WorkspaceMemberApiContext> {
  const context = await requireWorkspaceApiAccess(workspaceSlug, permission);

  if (context.accessMode !== "member" || !context.membership) {
    throw new AppError(
      "PERMISSION_DENIED",
      "Active workspace membership is required.",
    );
  }

  return {
    ...context,
    membership: context.membership,
    accessMode: "member",
  };
}
