import "server-only";

import { requireAuth } from "@/server/auth/require-auth";
import { AppError } from "@/server/errors";
import {
  hasPermission,
  type PermissionKey,
} from "@/server/permissions/permissions";
import { resolveWorkspaceAccess } from "@/server/permissions/resolve-workspace-access";
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

export async function requireWorkspaceApiAccess(
  workspaceSlug: string,
  permission?: PermissionKey | PermissionKey[],
): Promise<WorkspaceApiContext> {
  const session = await requireAuth();
  const workspace = await resolveWorkspace(workspaceSlug);
  const access = await resolveWorkspaceAccess(workspace.id, session.user.id);

  if (permission) {
    const required = Array.isArray(permission) ? permission : [permission];
    const allowed = required.some((key) => hasPermission(access.permissions, key));
    if (!allowed) {
      throw new AppError("PERMISSION_DENIED", "Permission denied.");
    }
  }

  return {
    userId: session.user.id,
    workspace,
    membership: access.membership,
    permissions: access.permissions,
    accessMode: access.mode,
    isWorkspaceAdmin: access.isWorkspaceAdmin,
  };
}
