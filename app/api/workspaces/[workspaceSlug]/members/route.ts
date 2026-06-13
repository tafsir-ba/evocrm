import { handleRouteError, successResponse } from "@/server/api/responses";
import { listWorkspaceMembersForWorkspace } from "@/server/services/members";
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

    const members = await listWorkspaceMembersForWorkspace(workspace.id);

    return successResponse({ members });
  } catch (error) {
    return handleRouteError(error);
  }
}
