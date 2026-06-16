import { handleRouteError, successResponse } from "@/server/api/responses";
import { evaluateCampaignReadiness } from "@/server/services/campaign-readiness";
import { getCampaignForWorkspace } from "@/server/services/campaigns";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:read",
    );

    const campaign = await getCampaignForWorkspace(workspace.id, campaignId);
    const readiness = await evaluateCampaignReadiness(workspace.id, campaign);

    return successResponse({ readiness });
  } catch (error) {
    return handleRouteError(error);
  }
}
