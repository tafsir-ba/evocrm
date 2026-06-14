import "server-only";

import { requireAuth } from "@/server/auth/require-auth";
import { AppError } from "@/server/errors";
import { requireMembership } from "@/server/permissions/require-membership";
import { requirePermission } from "@/server/permissions/require-permission";
import {
  hasPermission,
  type PermissionKey,
} from "@/server/permissions/permissions";
import type { WorkspaceMembership } from "@/server/permissions/types";
import { resolveWorkspace, type ResolvedWorkspace } from "@/server/workspaces/resolve-workspace";

export type WorkspaceApiContext = {
  userId: string;
  workspace: ResolvedWorkspace;
  membership: WorkspaceMembership;
};

export async function requireWorkspaceApiAccess(
  workspaceSlug: string,
  permission?: PermissionKey | PermissionKey[],
): Promise<WorkspaceApiContext> {
  const session = await requireAuth();
  const workspace = await resolveWorkspace(workspaceSlug);

  if (permission) {
    if (Array.isArray(permission)) {
      const membership = await requireMembership(workspace.id, session.user.id);
      const allowed = permission.some((key) =>
        hasPermission(membership.permissions, key),
      );

      if (!allowed) {
        throw new AppError("PERMISSION_DENIED", "Permission denied.");
      }

      return {
        userId: session.user.id,
        workspace,
        membership,
      };
    }

    const { membership } = await requirePermission(
      workspace.id,
      session.user.id,
      permission,
    );
    return {
      userId: session.user.id,
      workspace,
      membership,
    };
  }

  const membership = await requireMembership(workspace.id, session.user.id);

  return {
    userId: session.user.id,
    workspace,
    membership,
  };
}
