import "server-only";

import { AppError } from "@/server/errors";
import type { PermissionKey } from "@/server/permissions/permissions";
import {
  hasPermission,
  isValidPermission,
} from "@/server/permissions/permissions";

import { requireMembership } from "./require-membership";
import type { WorkspaceMembership } from "./types";

export type AuthorizedContext = {
  membership: WorkspaceMembership;
};

/**
 * Require a specific permission key within the resolved workspace context.
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

  const membership = await requireMembership(workspaceId, userId);

  if (!hasPermission(membership.permissions, permissionKey as PermissionKey)) {
    throw new AppError("PERMISSION_DENIED", "Permission denied.");
  }

  return { membership };
}
