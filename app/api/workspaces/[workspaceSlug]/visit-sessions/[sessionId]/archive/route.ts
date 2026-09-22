import { handleRouteError, successResponse } from "@/server/api/responses";
import { archiveVisitSessionForWorkspace } from "@/server/services/visit-sessions";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; sessionId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, sessionId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "activity:archive",
    );

    const session = await archiveVisitSessionForWorkspace(
      workspace.id,
      sessionId,
      userId,
    );

    return successResponse({ session });
  } catch (error) {
    return handleRouteError(error);
  }
}
