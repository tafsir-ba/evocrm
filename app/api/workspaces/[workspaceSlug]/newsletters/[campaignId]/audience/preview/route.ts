import { handleRouteError, successResponse } from "@/server/api/responses";
import { previewNewsletterAudienceForWorkspace } from "@/server/services/newsletters";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:read",
    );

    const preview = await previewNewsletterAudienceForWorkspace(
      workspace.id,
      campaignId,
      userId,
    );

    return successResponse({ preview });
  } catch (error) {
    return handleRouteError(error);
  }
}
