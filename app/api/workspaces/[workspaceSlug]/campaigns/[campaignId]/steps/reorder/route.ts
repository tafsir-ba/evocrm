import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { reorderCampaignStepsInputSchema } from "@/server/validation/campaign-steps";
import { reorderCampaignStepsForWorkspace } from "@/server/services/campaign-steps";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(reorderCampaignStepsInputSchema, body);
    const steps = await reorderCampaignStepsForWorkspace(
      workspace.id,
      userId,
      campaignId,
      input,
    );

    return successResponse({ steps });
  } catch (error) {
    return handleRouteError(error);
  }
}
