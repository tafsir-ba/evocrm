import {
  handleRouteError,
  successResponse,
} from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateCampaignInputSchema } from "@/server/validation/campaigns";
import {
  archiveCampaignForWorkspace,
  getCampaignForWorkspace,
  updateCampaignForWorkspace,
} from "@/server/services/campaigns";
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

    return successResponse({ campaign });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateCampaignInputSchema, body);

    const campaign = await updateCampaignForWorkspace(
      workspace.id,
      userId,
      campaignId,
      input,
    );

    return successResponse({ campaign });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:archive",
    );

    const campaign = await archiveCampaignForWorkspace(
      workspace.id,
      userId,
      campaignId,
    );

    return successResponse({ campaign });
  } catch (error) {
    return handleRouteError(error);
  }
}
