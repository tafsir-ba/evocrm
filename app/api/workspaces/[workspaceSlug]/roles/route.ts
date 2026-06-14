import { handleRouteError, successResponse } from "@/server/api/responses";
import { hasPermission } from "@/server/permissions/permissions";
import { parseRequestOrThrow } from "@/server/validation/request";
import { createRoleInputSchema } from "@/server/validation/roles";
import {
  createCustomRole,
  getPermissionGroups,
  listRolesForWorkspace,
} from "@/server/services/roles";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace, membership } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:read",
    );

    const roles = await listRolesForWorkspace(workspace.id);
    const canManage = hasPermission(membership.permissions, "roles:manage");
    const permissionGroups = getPermissionGroups();

    return successResponse({ roles, canManage, permissionGroups });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "roles:manage",
    );

    const body = parseRequestOrThrow(createRoleInputSchema, await request.json());

    const role = await createCustomRole({
      workspaceId: workspace.id,
      actorId: userId,
      data: body,
    });

    return successResponse({ role }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
