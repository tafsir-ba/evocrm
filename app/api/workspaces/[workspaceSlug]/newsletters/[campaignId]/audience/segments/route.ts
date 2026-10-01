import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { newsletterAudienceSegmentsInputSchema } from "@/server/validation/newsletters";
import {
  listNewsletterSegmentsForWorkspace,
  replaceNewsletterSegmentsForWorkspace,
} from "@/server/services/newsletters";
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

    const segments = await listNewsletterSegmentsForWorkspace(
      workspace.id,
      campaignId,
      userId,
    );

    return successResponse({ segments });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(newsletterAudienceSegmentsInputSchema, body);

    const segments = await replaceNewsletterSegmentsForWorkspace(
      workspace.id,
      userId,
      campaignId,
      input,
    );

    return successResponse({ segments });
  } catch (error) {
    return handleRouteError(error);
  }
}
