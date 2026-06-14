import { handleRouteError, successResponse } from "@/server/api/responses";
import { hasPermission } from "@/server/permissions/permissions";
import { parseRequestOrThrow } from "@/server/validation/request";
import { validateSearchParams } from "@/server/validation/request";
import {
  createMembershipInputSchema,
  membershipListQuerySchema,
} from "@/server/validation/memberships";
import {
  addMembershipToWorkspace,
  listMembershipsForWorkspace,
} from "@/server/services/memberships";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace, membership } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:read",
    );

    const canManage = hasPermission(membership.permissions, "users:manage");

    const url = new URL(request.url);
    const queryResult = validateSearchParams(
      membershipListQuerySchema,
      url.searchParams,
    );

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const memberships = await listMembershipsForWorkspace(workspace.id, {
      status: queryResult.data.status,
    });

    return successResponse({ memberships, canManage });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "users:manage",
    );

    const body = parseRequestOrThrow(
      createMembershipInputSchema,
      await request.json(),
    );

    const membership = await addMembershipToWorkspace({
      workspaceId: workspace.id,
      actorId: userId,
      data: body,
    });

    return successResponse({ membership }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
