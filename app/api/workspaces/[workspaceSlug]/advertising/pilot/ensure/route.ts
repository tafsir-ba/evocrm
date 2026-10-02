import { handleRouteError, successResponse } from "@/server/api/responses";
import { ensurePilotGrowthCampaignForWorkspace } from "@/server/services/advertising-meta-sync";
import { requireWorkspaceMemberApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

/** Ensures the Satigny Duplex Growth Campaign exists for the pilot workspace. */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { userId, workspace } = await requireWorkspaceMemberApiAccess(
      workspaceSlug,
      "advertising:create",
    );
    const growthCampaign = await ensurePilotGrowthCampaignForWorkspace({
      workspaceId: workspace.id,
      actorId: userId,
    });
    return successResponse({ growthCampaign }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
