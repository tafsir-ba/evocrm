import { handleRouteError, successResponse } from "@/server/api/responses";
import { refreshSendingDomainForWorkspace } from "@/server/services/sending-domains";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; domainId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, domainId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const domain = await refreshSendingDomainForWorkspace(
      workspace.id,
      userId,
      domainId,
    );

    return successResponse({ domain });
  } catch (error) {
    return handleRouteError(error);
  }
}
