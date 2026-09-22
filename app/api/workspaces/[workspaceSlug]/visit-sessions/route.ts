import {
  buildPaginationMeta,
  handleRouteError,
  paginatedResponse,
  successResponse,
} from "@/server/api/responses";
import {
  parseRequestOrThrow,
  validateSearchParams,
} from "@/server/validation/request";
import {
  createVisitSessionInputSchema,
  visitSessionListQuerySchema,
} from "@/server/validation/visit-sessions";
import {
  createVisitSessionForWorkspace,
  listVisitSessionsForWorkspace,
} from "@/server/services/visit-sessions";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "activity:read",
    );

    const url = new URL(request.url);
    const queryResult = validateSearchParams(
      visitSessionListQuerySchema,
      url.searchParams,
    );
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const query = queryResult.data;
    const { sessions, total } = await listVisitSessionsForWorkspace(
      workspace.id,
      query,
      userId,
    );

    return paginatedResponse(
      sessions,
      buildPaginationMeta(query.page, query.pageSize, total),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "activity:create",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(createVisitSessionInputSchema, body);
    const session = await createVisitSessionForWorkspace(
      workspace.id,
      userId,
      input,
    );

    return successResponse({ session }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
