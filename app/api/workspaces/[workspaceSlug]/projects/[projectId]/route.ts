import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateProjectInputSchema } from "@/server/validation/projects";
import {
  archiveProjectForWorkspace,
  getProjectForWorkspace,
  updateProjectForWorkspace,
} from "@/server/services/projects";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, projectId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "project:read",
    );

    const project = await getProjectForWorkspace(workspace.id, projectId);

    return successResponse({ project });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, projectId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "project:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateProjectInputSchema, body);

    const project = await updateProjectForWorkspace(
      workspace.id,
      projectId,
      userId,
      input,
    );

    return successResponse({ project });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, projectId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "project:archive",
    );

    const project = await archiveProjectForWorkspace(
      workspace.id,
      projectId,
      userId,
    );

    return successResponse({ project });
  } catch (error) {
    return handleRouteError(error);
  }
}
