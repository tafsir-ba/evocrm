import { handleRouteError, successResponse } from "@/server/api/responses";
import { exportWorkspaceData } from "@/server/services/workspace-export";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const exportBundle = await exportWorkspaceData({
      workspaceId: workspace.id,
      actorId: userId,
    });

    return successResponse({ export: exportBundle });
  } catch (error) {
    return handleRouteError(error);
  }
}
