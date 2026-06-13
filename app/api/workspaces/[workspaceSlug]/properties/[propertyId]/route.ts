import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updatePropertyInputSchema } from "@/server/validation/properties";
import {
  archivePropertyForWorkspace,
  getPropertyForWorkspace,
  updatePropertyForWorkspace,
} from "@/server/services/properties";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; propertyId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, propertyId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(workspaceSlug, "property:read");

    const property = await getPropertyForWorkspace(workspace.id, propertyId);

    return successResponse({ property });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, propertyId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "property:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updatePropertyInputSchema, body);

    const property = await updatePropertyForWorkspace(
      workspace.id,
      propertyId,
      userId,
      input,
    );

    return successResponse({ property });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, propertyId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "property:archive",
    );

    const property = await archivePropertyForWorkspace(
      workspace.id,
      propertyId,
      userId,
    );

    return successResponse({ property });
  } catch (error) {
    return handleRouteError(error);
  }
}
