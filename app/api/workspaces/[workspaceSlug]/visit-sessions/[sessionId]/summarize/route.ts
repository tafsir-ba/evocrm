import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { summarizeVisitSessionInputSchema } from "@/server/validation/visit-sessions";
import { summarizeVisitSessionForWorkspace } from "@/server/services/visit-sessions";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; sessionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, sessionId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "activity:update",
    );

    const body: unknown = await request.json().catch(() => ({}));
    const input = parseRequestOrThrow(summarizeVisitSessionInputSchema, body ?? {});
    const session = await summarizeVisitSessionForWorkspace(
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
