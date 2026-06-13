import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateActivityInputSchema } from "@/server/validation/activities";
import {
  archiveActivityForWorkspace,
  getActivityForWorkspace,
  updateActivityForWorkspace,
} from "@/server/services/activities";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; activityId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, activityId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(workspaceSlug, "activity:read");

    const activity = await getActivityForWorkspace(workspace.id, activityId);

    return successResponse({ activity });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, activityId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "activity:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateActivityInputSchema, body);

    const activity = await updateActivityForWorkspace(
      workspace.id,
      activityId,
      userId,
      input,
    );

    return successResponse({ activity });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, activityId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "activity:archive",
    );

    const activity = await archiveActivityForWorkspace(workspace.id, activityId, userId);

    return successResponse({ activity });
  } catch (error) {
    return handleRouteError(error);
  }
}
