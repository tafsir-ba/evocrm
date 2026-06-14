import { handleRouteError, successResponse } from "@/server/api/responses";
import { getDashboardSummaryForWorkspace } from "@/server/services/dashboard";
import { validateSearchParams } from "@/server/validation/request";
import { dashboardQuerySchema } from "@/server/validation/dashboard";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "dashboard:read",
    );

    const url = new URL(request.url);
    const queryResult = validateSearchParams(dashboardQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const summary = await getDashboardSummaryForWorkspace(
      workspace.id,
      queryResult.data,
    );

    return successResponse(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}
