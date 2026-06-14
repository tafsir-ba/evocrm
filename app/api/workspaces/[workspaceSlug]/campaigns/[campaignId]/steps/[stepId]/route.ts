import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateCampaignStepInputSchema } from "@/server/validation/campaign-steps";
import {
  deleteCampaignStepForWorkspace,
  updateCampaignStepForWorkspace,
} from "@/server/services/campaign-steps";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string; stepId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId, stepId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateCampaignStepInputSchema, body);

    const step = await updateCampaignStepForWorkspace(
      workspace.id,
      userId,
      campaignId,
      stepId,
      input,
    );

    return successResponse({ step });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId, stepId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    await deleteCampaignStepForWorkspace(
      workspace.id,
      userId,
      campaignId,
      stepId,
    );

    return successResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
