import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { appendVisitMessageInputSchema } from "@/server/validation/visit-sessions";
import { appendVisitMessageForWorkspace } from "@/server/services/visit-sessions";
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

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(appendVisitMessageInputSchema, body);
    const session = await appendVisitMessageForWorkspace(
      workspace.id,
      sessionId,
      userId,
      input,
    );

    return successResponse({ session }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
