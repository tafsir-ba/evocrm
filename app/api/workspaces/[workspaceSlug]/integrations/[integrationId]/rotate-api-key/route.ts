import { handleRouteError, successResponse } from "@/server/api/responses";
import { rotateIntegrationApiKeyForWorkspace } from "@/server/services/integrations";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; integrationId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const result = await rotateIntegrationApiKeyForWorkspace(
      workspace.id,
      integrationId,
      userId,
    );

    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
