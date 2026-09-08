import { handleRouteError, successResponse } from "@/server/api/responses";
import { probeHubSpotIntegrationForWorkspace } from "@/server/services/hubspot-project-mapping";
import { requireWorkspaceMemberApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; integrationId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const { userId, workspace } = await requireWorkspaceMemberApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const probe = await probeHubSpotIntegrationForWorkspace(
      workspace.id,
      integrationId,
      userId,
    );

    return successResponse({ probe });
  } catch (error) {
    return handleRouteError(error);
  }
}
