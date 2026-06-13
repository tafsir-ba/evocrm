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
  activityListQuerySchema,
  createActivityInputSchema,
} from "@/server/validation/activities";
import {
  createActivityForWorkspace,
  listActivitiesForWorkspace,
} from "@/server/services/activities";
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
    const queryResult = validateSearchParams(activityListQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const query = queryResult.data;
    const { activities, total } = await listActivitiesForWorkspace(
      workspace.id,
      query,
      userId,
    );

    return paginatedResponse(
      activities,
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
    const input = parseRequestOrThrow(createActivityInputSchema, body);

    const activity = await createActivityForWorkspace(workspace.id, userId, input);

    return successResponse({ activity }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
