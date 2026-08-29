import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  listHubSpotProjectMappingsForWorkspace,
  refreshHubSpotProjectInventoryForWorkspace,
} from "@/server/services/hubspot-project-mapping";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; integrationId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:read",
    );

    const mappings = await listHubSpotProjectMappingsForWorkspace(
      workspace.id,
      integrationId,
    );

    return successResponse({ mappings });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Refresh HubSpot project inventory into mapping rows (does not invent destinations). */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const result = await refreshHubSpotProjectInventoryForWorkspace(
      workspace.id,
      integrationId,
      userId,
    );

    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
