import { handleRouteError, successResponse } from "@/server/api/responses";
import { restoreLeadForWorkspace } from "@/server/services/leads";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; leadId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:archive",
    );

    const lead = await restoreLeadForWorkspace(workspace.id, leadId, userId);

    return successResponse({ lead });
  } catch (error) {
    return handleRouteError(error);
  }
}
