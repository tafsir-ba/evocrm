import { handleRouteError, successResponse } from "@/server/api/responses";
import { validateSearchParams } from "@/server/validation/request";
import { dictionaryListQuerySchema } from "@/server/validation/dictionaries";
import { listDictionariesForWorkspace } from "@/server/services/dictionaries";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:read",
    );

    const url = new URL(request.url);
    const queryResult = validateSearchParams(
      dictionaryListQuerySchema,
      url.searchParams,
    );

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const dictionaries = await listDictionariesForWorkspace(
      workspace.id,
      queryResult.data.type ? { type: queryResult.data.type } : undefined,
    );

    return successResponse({ dictionaries });
  } catch (error) {
    return handleRouteError(error);
  }
}
