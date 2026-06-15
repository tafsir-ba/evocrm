import { handleRouteError, successResponse } from "@/server/api/responses";
import { purgeCampaignForWorkspace } from "@/server/services/campaigns";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:archive",
    );

    const result = await purgeCampaignForWorkspace(workspace.id, userId, campaignId);

    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
