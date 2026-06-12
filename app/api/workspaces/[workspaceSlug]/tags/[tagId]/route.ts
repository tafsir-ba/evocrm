import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateTagInputSchema } from "@/server/validation/dictionaries";
import {
  archiveTagForWorkspace,
  updateTagForWorkspace,
} from "@/server/services/tags";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; tagId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, tagId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateTagInputSchema, body);

    const tag = await updateTagForWorkspace(workspace.id, tagId, userId, input);

    return successResponse({ tag });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, tagId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const tag = await archiveTagForWorkspace(workspace.id, tagId, userId);

    return successResponse({ tag });
  } catch (error) {
    return handleRouteError(error);
  }
}
