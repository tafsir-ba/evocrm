import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateCampaignEnrollmentInputSchema } from "@/server/validation/campaign-enrollments";
import { updateCampaignEnrollmentForWorkspace } from "@/server/services/campaign-enrollments";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{
    workspaceSlug: string;
    campaignId: string;
    enrollmentId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId, enrollmentId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateCampaignEnrollmentInputSchema, body);

    const enrollment = await updateCampaignEnrollmentForWorkspace(
      workspace.id,
      userId,
      campaignId,
      enrollmentId,
      input,
    );

    return successResponse({ enrollment });
  } catch (error) {
    return handleRouteError(error);
  }
}
