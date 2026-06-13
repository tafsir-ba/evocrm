import "server-only";

import { requireAuth } from "@/server/auth/require-auth";
import { requireMembership } from "@/server/permissions/require-membership";
import { requirePermission } from "@/server/permissions/require-permission";
import type { PermissionKey } from "@/server/permissions/permissions";
import type { WorkspaceMembership } from "@/server/permissions/types";
import { resolveWorkspace, type ResolvedWorkspace } from "@/server/workspaces/resolve-workspace";

export type WorkspaceApiContext = {
  userId: string;
  workspace: ResolvedWorkspace;
  membership: WorkspaceMembership;
};

export async function requireWorkspaceApiAccess(
  workspaceSlug: string,
  permission?: PermissionKey,
): Promise<WorkspaceApiContext> {
  const session = await requireAuth();
  const workspace = await resolveWorkspace(workspaceSlug);

  if (permission) {
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
