import { handleRouteError, successResponse } from "@/server/api/responses";
import { duplicateCampaignStepForWorkspace } from "@/server/services/campaign-steps";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string; stepId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId, stepId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const step = await duplicateCampaignStepForWorkspace(
      workspace.id,
      userId,
      campaignId,
      stepId,
    );

    return successResponse({ step }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
