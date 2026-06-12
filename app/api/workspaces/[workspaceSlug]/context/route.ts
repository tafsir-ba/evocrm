import { handleRouteError, successResponse } from "@/server/api/responses";
import { requireAuth } from "@/server/auth/require-auth";
import { getWorkspaceContext } from "@/server/services/workspaces";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requireAuth();
    const { workspaceSlug } = await context.params;
    const workspaceContext = await getWorkspaceContext(
      session.user.id,
      workspaceSlug,
    );

    return successResponse(workspaceContext);
  } catch (error) {
    return handleRouteError(error);
  }
}
