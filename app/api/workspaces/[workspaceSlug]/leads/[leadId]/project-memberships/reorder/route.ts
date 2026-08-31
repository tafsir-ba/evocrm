import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { reorderLeadProjectMembershipsInputSchema } from "@/server/validation/lead-project-memberships";
import { reorderLeadProjectMemberships } from "@/server/services/lead-project-memberships";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; leadId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:update",
    );
    const body: unknown = await request.json();
    const input = parseRequestOrThrow(reorderLeadProjectMembershipsInputSchema, body);
    const memberships = await reorderLeadProjectMemberships({
      workspaceId: workspace.id,
      leadId,
      actorId: userId,
      membershipIds: input.membershipIds,
    });
    return successResponse({ memberships });
  } catch (error) {
    return handleRouteError(error);
  }
}
