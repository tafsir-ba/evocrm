import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { createCampaignStepInputSchema } from "@/server/validation/campaign-steps";
import {
  createCampaignStepForWorkspace,
  listCampaignStepsForWorkspace,
} from "@/server/services/campaign-steps";
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

    const steps = await listCampaignStepsForWorkspace(workspace.id, campaignId);

    return successResponse({ steps });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(createCampaignStepInputSchema, body);

    const step = await createCampaignStepForWorkspace(
      workspace.id,
      userId,
      campaignId,
      input,
    );

    return successResponse({ step }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
