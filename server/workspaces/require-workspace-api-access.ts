import "server-only";

import { requireAuth } from "@/server/auth/require-auth";
import { requireMembership } from "@/server/permissions/require-membership";
import { requirePermission } from "@/server/permissions/require-permission";
import type { PermissionKey } from "@/server/permissions/permissions";
import { resolveWorkspace, type ResolvedWorkspace } from "@/server/workspaces/resolve-workspace";

export type WorkspaceApiContext = {
  userId: string;
  workspace: ResolvedWorkspace;
};

export async function requireWorkspaceApiAccess(
  workspaceSlug: string,
  permission?: PermissionKey,
): Promise<WorkspaceApiContext> {
  const session = await requireAuth();
  const workspace = await resolveWorkspace(workspaceSlug);

  if (permission) {
    await requirePermission(workspace.id, session.user.id, permission);
  } else {
    await requireMembership(workspace.id, session.user.id);
  }

  return {
    userId: session.user.id,
    workspace,
  };
}
