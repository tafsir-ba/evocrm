import { handleRouteError, successResponse } from "@/server/api/responses";
import { pauseCampaignEnrollmentForWorkspace } from "@/server/services/campaign-enrollments";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{
    workspaceSlug: string;
    campaignId: string;
    enrollmentId: string;
  }>;
};

export async function PATCH(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId, enrollmentId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const enrollment = await pauseCampaignEnrollmentForWorkspace(
      workspace.id,
      userId,
      campaignId,
      enrollmentId,
    );

    return successResponse({ enrollment });
  } catch (error) {
    return handleRouteError(error);
  }
}
