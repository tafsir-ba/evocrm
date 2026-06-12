import "server-only";

import { AppError } from "@/server/errors";
import { findMembership } from "@/server/repositories/memberships";
import { findRoleById } from "@/server/repositories/roles";

import type { WorkspaceMembership } from "./types";

/**
 * Require an active workspace membership for the current user.
 */
export async function requireMembership(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMembership> {
  const membership = await findMembership(userId, workspaceId);

  if (!membership) {
    throw new AppError("MEMBERSHIP_REQUIRED", "Workspace membership required.");
  }

  if (membership.status !== "active") {
    throw new AppError("FORBIDDEN", "Workspace membership is not active.");
  }

  const role = await findRoleById(membership.roleId);

  if (!role) {
    throw new AppError("INTERNAL_ERROR", "Membership role not found.", {
      expose: false,
    });
  }

  return {
    id: membership.id,
    workspaceId: membership.workspaceId,
    userId: membership.userId,
    roleId: membership.roleId,
    status: membership.status,
    permissions: role.permissions,
  };
}
