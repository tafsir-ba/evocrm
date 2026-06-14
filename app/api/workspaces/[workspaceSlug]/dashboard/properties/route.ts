import { handleRouteError, successResponse } from "@/server/api/responses";
import { getDashboardPropertiesForWorkspace } from "@/server/services/dashboard";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "dashboard:read",
    );

    const properties = await getDashboardPropertiesForWorkspace(workspace.id);

    return successResponse(properties);
  } catch (error) {
    return handleRouteError(error);
  }
}
