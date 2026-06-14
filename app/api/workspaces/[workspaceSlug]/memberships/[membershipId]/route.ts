import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateMembershipInputSchema } from "@/server/validation/memberships";
import {
  removeMembershipFromWorkspace,
  updateMembershipInWorkspace,
} from "@/server/services/memberships";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; membershipId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, membershipId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "users:manage",
    );

    const body = parseRequestOrThrow(
      updateMembershipInputSchema,
      await request.json(),
    );

    const membership = await updateMembershipInWorkspace({
      workspaceId: workspace.id,
      membershipId,
      actorId: userId,
      data: body,
    });

    return successResponse({ membership });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, membershipId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "users:manage",
    );

    const membership = await removeMembershipFromWorkspace({
      workspaceId: workspace.id,
      membershipId,
      actorId: userId,
    });

    return successResponse({ membership });
  } catch (error) {
    return handleRouteError(error);
  }
}
