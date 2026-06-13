import {
  buildPaginationMeta,
  handleRouteError,
  paginatedResponse,
} from "@/server/api/responses";
import { listDocumentsForWorkspace } from "@/server/services/documents";
import { documentListQuerySchema } from "@/server/validation/documents";
import { validateSearchParams } from "@/server/validation/request";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace, membership } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "document:read",
    );

    const url = new URL(request.url);
    const queryResult = validateSearchParams(documentListQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const query = queryResult.data;
    const { documents, total } = await listDocumentsForWorkspace(
      workspace.id,
      query,
      membership.permissions,
    );

    return paginatedResponse(
      documents,
      buildPaginationMeta(query.page, query.pageSize, total),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
