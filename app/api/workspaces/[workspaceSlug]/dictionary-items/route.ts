import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  parseRequestOrThrow,
  validateSearchParams,
} from "@/server/validation/request";
import {
  createDictionaryItemInputSchema,
  dictionaryItemListQuerySchema,
} from "@/server/validation/dictionaries";
import {
  createDictionaryItemForWorkspace,
  listDictionaryItemsForWorkspace,
} from "@/server/services/dictionary-items";
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
      dictionaryItemListQuerySchema,
      url.searchParams,
    );

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const items = await listDictionaryItemsForWorkspace(workspace.id, {
      type: queryResult.data.type,
      dictionaryId: queryResult.data.dictionaryId,
      includeInactive: queryResult.data.includeInactive,
    });

    return successResponse({ items });
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
    const input = parseRequestOrThrow(createDictionaryItemInputSchema, body);

    const item = await createDictionaryItemForWorkspace(
      workspace.id,
      userId,
      input,
    );

    return successResponse({ item }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
