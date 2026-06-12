import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  parseRequestOrThrow,
  validateSearchParams,
} from "@/server/validation/request";
import {
  createTagInputSchema,
  tagListQuerySchema,
} from "@/server/validation/dictionaries";
import {
  createTagForWorkspace,
  listTagsForWorkspace,
} from "@/server/services/tags";
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
    const queryResult = validateSearchParams(tagListQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const tags = await listTagsForWorkspace(workspace.id, {
      entityType: queryResult.data.entityType,
      includeArchived: queryResult.data.includeArchived,
    });

    return successResponse({ tags });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(createTagInputSchema, body);

    const tag = await createTagForWorkspace(workspace.id, userId, input);

    return successResponse({ tag }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
