import { handleRouteError, successResponse } from "@/server/api/responses";
import { restoreCampaignForWorkspace } from "@/server/services/campaigns";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const campaign = await restoreCampaignForWorkspace(
      workspace.id,
      userId,
      campaignId,
    );

    return successResponse({ campaign });
  } catch (error) {
    return handleRouteError(error);
  }
}
