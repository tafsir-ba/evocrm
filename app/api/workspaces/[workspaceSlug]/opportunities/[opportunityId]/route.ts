import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateOpportunityInputSchema } from "@/server/validation/opportunities";
import {
  archiveOpportunityForWorkspace,
  getOpportunityForWorkspace,
  updateOpportunityForWorkspace,
} from "@/server/services/opportunities";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; opportunityId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, opportunityId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "opportunity:read",
    );

    const opportunity = await getOpportunityForWorkspace(workspace.id, opportunityId);

    return successResponse({ opportunity });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, opportunityId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "opportunity:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateOpportunityInputSchema, body);

    const opportunity = await updateOpportunityForWorkspace(
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

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, opportunityId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "opportunity:archive",
    );

    const opportunity = await archiveOpportunityForWorkspace(
      workspace.id,
      opportunityId,
      userId,
    );

    return successResponse({ opportunity });
  } catch (error) {
    return handleRouteError(error);
  }
}
