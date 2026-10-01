import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { newsletterScheduleInputSchema } from "@/server/validation/newsletters";
import { scheduleNewsletterForWorkspace } from "@/server/services/newsletters";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(newsletterScheduleInputSchema, body);

    const campaign = await scheduleNewsletterForWorkspace(
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
