import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateVisitSessionInputSchema } from "@/server/validation/visit-sessions";
import {
  getVisitSessionForWorkspace,
  updateVisitSessionForWorkspace,
} from "@/server/services/visit-sessions";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; sessionId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, sessionId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "activity:read",
    );

    const session = await getVisitSessionForWorkspace(
      workspace.id,
      sessionId,
      userId,
    );

    return successResponse({ session });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, sessionId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "activity:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateVisitSessionInputSchema, body);
    const session = await updateVisitSessionForWorkspace(
      workspace.id,
      sessionId,
      userId,
      input,
    );

    return successResponse({ session });
  } catch (error) {
    return handleRouteError(error);
  }
}
