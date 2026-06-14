import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateIntegrationInputSchema } from "@/server/validation/integrations";
import {
  archiveIntegrationForWorkspace,
  getIntegrationForWorkspace,
  updateIntegrationForWorkspace,
} from "@/server/services/integrations";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; integrationId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:read",
    );

    const integration = await getIntegrationForWorkspace(workspace.id, integrationId);

    return successResponse({ integration });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateIntegrationInputSchema, body);

    const integration = await updateIntegrationForWorkspace(
      workspace.id,
      integrationId,
      userId,
      input,
    );

    return successResponse({ integration });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "settings:update",
    );

    const integration = await archiveIntegrationForWorkspace(
      workspace.id,
      integrationId,
      userId,
    );

    return successResponse({ integration });
  } catch (error) {
    return handleRouteError(error);
  }
}
