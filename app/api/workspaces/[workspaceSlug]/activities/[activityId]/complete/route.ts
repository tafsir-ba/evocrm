import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { completeActivityInputSchema } from "@/server/validation/activities";
import { completeActivityForWorkspace } from "@/server/services/activities";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; activityId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, activityId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "activity:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(completeActivityInputSchema, body);

    const activity = await completeActivityForWorkspace(
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
