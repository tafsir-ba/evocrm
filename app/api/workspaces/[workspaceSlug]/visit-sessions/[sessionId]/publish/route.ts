import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { publishVisitSessionInputSchema } from "@/server/validation/visit-sessions";
import { publishVisitSessionForWorkspace } from "@/server/services/visit-sessions";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; sessionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, sessionId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "activity:create",
    );

    const body: unknown = await request.json().catch(() => ({}));
    const input = parseRequestOrThrow(publishVisitSessionInputSchema, body ?? {});
    const session = await publishVisitSessionForWorkspace(
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
