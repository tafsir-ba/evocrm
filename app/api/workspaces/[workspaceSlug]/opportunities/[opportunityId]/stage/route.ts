import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { stageOpportunityInputSchema } from "@/server/validation/opportunities";
import { moveOpportunityStageForWorkspace } from "@/server/services/opportunities";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; opportunityId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, opportunityId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "opportunity:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(stageOpportunityInputSchema, body);

    const opportunity = await moveOpportunityStageForWorkspace(
      workspace.id,
      opportunityId,
      userId,
      input,
    );

    return successResponse({ opportunity });
  } catch (error) {
    return handleRouteError(error);
  }
}
