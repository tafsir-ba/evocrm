import { handleRouteError, successResponse } from "@/server/api/responses";
import { validateSearchParams } from "@/server/validation/request";
import { integrationLogListQuerySchema } from "@/server/validation/integrations";
import { listIntegrationLogsForWorkspace } from "@/server/services/integrations";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; integrationId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:read",
    );

    const url = new URL(request.url);
    const queryResult = validateSearchParams(
      integrationLogListQuerySchema,
      url.searchParams,
    );

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const logs = await listIntegrationLogsForWorkspace(workspace.id, integrationId, {
      status: queryResult.data.status,
      eventType: queryResult.data.eventType,
      limit: queryResult.data.limit,
    });

    return successResponse({ logs });
  } catch (error) {
    return handleRouteError(error);
  }
}
