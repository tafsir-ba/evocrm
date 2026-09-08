import { handleRouteError, successResponse } from "@/server/api/responses";
import { getReassignmentSummary } from "@/server/services/reassignment";
import { requireWorkspaceMemberApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; membershipId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, membershipId } = await context.params;
    const { workspace } = await requireWorkspaceMemberApiAccess(
      workspaceSlug,
      "users:manage",
    );

    const summary = await getReassignmentSummary({
      workspaceId: workspace.id,
      membershipId,
    });

    return successResponse(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}
