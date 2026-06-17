import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { bulkDeleteLeadsInputSchema } from "@/server/validation/leads";
import { purgeLeadsForWorkspace } from "@/server/services/leads";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:delete",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(bulkDeleteLeadsInputSchema, body);

    const result = await purgeLeadsForWorkspace(workspace.id, userId, input);

    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
