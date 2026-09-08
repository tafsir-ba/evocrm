import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { z } from "zod";
import {
  getDictionaryForWorkspace,
  updateDictionaryForWorkspace,
} from "@/server/services/dictionaries";
import { requireWorkspaceMemberApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; dictionaryId: string }>;
};

const updateDictionarySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, dictionaryId } = await context.params;
    const { workspace } = await requireWorkspaceMemberApiAccess(
      workspaceSlug,
      "settings:read",
    );

    const dictionary = await getDictionaryForWorkspace(workspace.id, dictionaryId);
    return successResponse({ dictionary });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, dictionaryId } = await context.params;
    const { userId, workspace } = await requireWorkspaceMemberApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateDictionarySchema, body);

    const dictionary = await updateDictionaryForWorkspace(
      workspace.id,
      dictionaryId,
      userId,
      input,
    );

    return successResponse({ dictionary });
  } catch (error) {
    return handleRouteError(error);
  }
}
