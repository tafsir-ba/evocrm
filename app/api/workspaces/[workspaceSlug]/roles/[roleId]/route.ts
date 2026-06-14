import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateRoleInputSchema } from "@/server/validation/roles";
import {
  deleteCustomRole,
  updateCustomRole,
} from "@/server/services/roles";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; roleId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, roleId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "roles:manage",
    );

    const body = parseRequestOrThrow(updateRoleInputSchema, await request.json());

    const role = await updateCustomRole({
      workspaceId: workspace.id,
      roleId,
      actorId: userId,
      data: body,
    });

    return successResponse({ role });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, roleId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "roles:manage",
    );

    await deleteCustomRole({
      workspaceId: workspace.id,
      roleId,
      actorId: userId,
    });

    return successResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
