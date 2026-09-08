import "server-only";

import { AppError } from "@/server/errors";
import type { PermissionKey } from "@/server/permissions/permissions";
import {
  hasPermission,
  isValidPermission,
} from "@/server/permissions/permissions";
import {
  isWorkspaceWidePermission,
  resolveWorkspaceAccess,
} from "@/server/permissions/resolve-workspace-access";
import type { WorkspaceMembership } from "./types";

export type AuthorizedContext = {
  membership: WorkspaceMembership | null;
  permissions: PermissionKey[];
  accessMode: "member" | "shared_project";
};

/**
 * Require a specific permission key within the resolved workspace context.
 * Supports project-grant-only collaborators (no WorkspaceMembership) for
 * project-scoped permissions only — never workspace administration.
 */
export async function requirePermission(
  workspaceId: string,
  userId: string,
  permissionKey: PermissionKey | string,
): Promise<AuthorizedContext> {
  if (!isValidPermission(permissionKey)) {
    throw new AppError("INTERNAL_ERROR", "Invalid permission key.", {
      expose: false,
    });
  }

  const access = await resolveWorkspaceAccess(workspaceId, userId);

  if (access.mode === "shared_project" && isWorkspaceWidePermission(permissionKey)) {
    throw new AppError(
      "PERMISSION_DENIED",
      "Project sharing does not grant workspace administration access.",
    );
  }

  if (!hasPermission(access.permissions, permissionKey as PermissionKey)) {
    throw new AppError("PERMISSION_DENIED", "Permission denied.");
  }

  return {
    membership: access.membership,
    permissions: access.permissions,
    accessMode: access.mode,
  };
}
