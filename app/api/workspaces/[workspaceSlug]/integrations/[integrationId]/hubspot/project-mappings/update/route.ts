import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { hubspotProjectMappingUpdateSchema } from "@/server/validation/hubspot-project-mapping";
import { saveHubSpotProjectMappingForWorkspace } from "@/server/services/hubspot-project-mapping";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; integrationId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(hubspotProjectMappingUpdateSchema, body);

    const mapping = await saveHubSpotProjectMappingForWorkspace({
      workspaceId: workspace.id,
      integrationId,
      actorId: userId,
      hubspotProjectId: input.hubspotProjectId,
      status: input.status,
      evoProjectId: input.evoProjectId ?? null,
    });

    return successResponse({ mapping });
  } catch (error) {
    return handleRouteError(error);
  }
}
