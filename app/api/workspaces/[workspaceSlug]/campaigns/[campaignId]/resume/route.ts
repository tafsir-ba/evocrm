import { handleRouteError, successResponse } from "@/server/api/responses";
import { resumeCampaignForWorkspace } from "@/server/services/campaigns";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

export async function PATCH(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const campaign = await resumeCampaignForWorkspace(
      workspace.id,
      userId,
      campaignId,
    );

    return successResponse({ campaign });
  } catch (error) {
    return handleRouteError(error);
  }
}
