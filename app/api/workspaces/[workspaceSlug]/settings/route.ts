import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateWorkspaceSettingsSchema } from "@/server/validation/workspace-settings";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
} from "@/server/services/workspace-settings";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:read",
    );

    const settings = await getWorkspaceSettings(workspace.id);

    return successResponse({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const body = parseRequestOrThrow(
      updateWorkspaceSettingsSchema,
      await request.json(),
    );

    const settings = await updateWorkspaceSettings({
      workspaceId: workspace.id,
      actorId: userId,
      data: body,
    });

    return successResponse({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}
