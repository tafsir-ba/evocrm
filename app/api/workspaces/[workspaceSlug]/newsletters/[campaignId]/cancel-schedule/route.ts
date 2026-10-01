import { handleRouteError, successResponse } from "@/server/api/responses";
import { cancelNewsletterScheduleForWorkspace } from "@/server/services/newsletters";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const campaign = await cancelNewsletterScheduleForWorkspace(
      workspace.id,
      userId,
      campaignId,
    );

    return successResponse({ campaign });
  } catch (error) {
    return handleRouteError(error);
  }
}
