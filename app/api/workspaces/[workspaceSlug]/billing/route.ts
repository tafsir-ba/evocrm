import { handleRouteError, successResponse } from "@/server/api/responses";
import { getBillingShell } from "@/server/services/billing";
import { requireWorkspaceMemberApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace, userId } = await requireWorkspaceMemberApiAccess(
      workspaceSlug,
      "billing:manage",
    );

    const billing = await getBillingShell({
      workspaceId: workspace.id,
      actorId: userId,
    });

    return successResponse({ billing });
  } catch (error) {
    return handleRouteError(error);
  }
}
