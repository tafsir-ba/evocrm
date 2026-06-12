import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateDictionaryItemInputSchema } from "@/server/validation/dictionaries";
import {
  inactivateDictionaryItemForWorkspace,
  updateDictionaryItemForWorkspace,
} from "@/server/services/dictionary-items";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; itemId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, itemId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateDictionaryItemInputSchema, body);

    const item = await updateDictionaryItemForWorkspace(
      workspace.id,
      itemId,
      userId,
      input,
    );

    return successResponse({ item });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, itemId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const item = await inactivateDictionaryItemForWorkspace(
      workspace.id,
      itemId,
      userId,
    );

    return successResponse({ item });
  } catch (error) {
    return handleRouteError(error);
  }
}
