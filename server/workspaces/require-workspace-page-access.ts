import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRequiredPermissionForSegment } from "@/lib/v1-navigation";
import { AppError } from "@/server/errors";
import { requireAuth } from "@/server/auth/require-auth";
import type { SessionUser } from "@/server/auth/types";
import { requirePermission } from "@/server/permissions/require-permission";
import { getWorkspaceContext } from "@/server/services/workspaces";
import type { WorkspaceContext } from "@/server/services/workspaces";

export type WorkspacePageAccess = {
  user: SessionUser;
  context: WorkspaceContext;
  permissionDenied: boolean;
};

function getWorkspaceSegmentFromPathname(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "w" || segments.length < 3) {
    return undefined;
  }

  return segments[2];
}

export async function requireWorkspacePageAccess(
  workspaceSlug: string,
): Promise<WorkspacePageAccess> {
  let session;

  try {
    session = await requireAuth();
  } catch {
    redirect("/login");
  }

  let context: WorkspaceContext;

  try {
    context = await getWorkspaceContext(session.user.id, workspaceSlug);
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "WORKSPACE_NOT_FOUND") {
        redirect("/workspaces");
      }

      if (
        error.code === "MEMBERSHIP_REQUIRED" ||
        error.code === "FORBIDDEN"
      ) {
        redirect("/workspaces");
      }
    }

    throw error;
  }

  const pathname = (await headers()).get("x-pathname") ?? "";
  const segment = getWorkspaceSegmentFromPathname(pathname);
  const requiredPermission = segment
    ? getRequiredPermissionForSegment(segment)
    : undefined;

  if (requiredPermission) {
    try {
      await requirePermission(
        context.workspace.id,
        session.user.id,
        requiredPermission,
      );
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === "PERMISSION_DENIED"
      ) {
        return {
          user: session.user,
          context,
          permissionDenied: true,
        };
      }

      throw error;
    }
  }

  return {
    user: session.user,
    context,
    permissionDenied: false,
  };
}
