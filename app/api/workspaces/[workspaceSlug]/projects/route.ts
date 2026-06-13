import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  parseRequestOrThrow,
  validateSearchParams,
} from "@/server/validation/request";
import {
  createProjectInputSchema,
  projectListQuerySchema,
} from "@/server/validation/projects";
import {
  createProjectForWorkspace,
  listProjectsForWorkspace,
} from "@/server/services/projects";
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
    const queryResult = validateSearchParams(projectListQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const projects = await listProjectsForWorkspace(workspace.id, {
      includeArchived: queryResult.data.includeArchived,
      search: queryResult.data.search,
      assignedTo: queryResult.data.assignedTo,
    });

    return successResponse({ projects });
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
    const input = parseRequestOrThrow(createProjectInputSchema, body);

    const project = await createProjectForWorkspace(workspace.id, userId, input);

    return successResponse({ project }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
