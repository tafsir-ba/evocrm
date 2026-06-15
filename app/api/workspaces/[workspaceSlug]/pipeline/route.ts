import { handleRouteError, successResponse } from "@/server/api/responses";
import { validateSearchParams } from "@/server/validation/request";
import { pipelineQuerySchema } from "@/server/validation/opportunities";
import { getPipelineForWorkspace } from "@/server/services/pipeline";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "opportunity:read",
    );

    const url = new URL(request.url);
    const queryResult = validateSearchParams(pipelineQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const query = queryResult.data;
    const pipeline = await getPipelineForWorkspace(workspace.id, {
      search: query.search,
      projectId: query.projectId,
      statusId: query.statusId,
      assignedTo: query.assignedTo,
      ownerId: query.ownerId,
      tagId: query.tagId,
      leadId: query.leadId,
      propertyId: query.propertyId,
    });

    return successResponse({ ...pipeline });
  } catch (error) {
    return handleRouteError(error);
  }
}
