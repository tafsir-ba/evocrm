import {
  buildPaginationMeta,
  handleRouteError,
  paginatedResponse,
  successResponse,
} from "@/server/api/responses";
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
  listProjectsPageForWorkspace,
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
      "project:read",
    );

    const url = new URL(request.url);
    const queryResult = validateSearchParams(projectListQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const query = queryResult.data;
    const browsing =
      query.page !== undefined ||
      query.pageSize !== undefined ||
      query.view !== undefined ||
      query.sort !== undefined;

    if (browsing) {
      const { projects, total } = await listProjectsPageForWorkspace(workspace.id, {
        includeArchived: query.includeArchived,
        search: query.search,
        assignedTo: query.assignedTo,
        countryCode: query.countryCode,
        cantonCode: query.cantonCode,
        municipality: query.municipality,
        withCounts: query.withCounts,
        view: query.view,
        sort: query.sort,
        sortDir: query.sortDir,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 25,
      });

      return paginatedResponse(
        projects,
        buildPaginationMeta(query.page ?? 1, query.pageSize ?? 25, total),
      );
    }

    const projects = await listProjectsForWorkspace(workspace.id, {
      includeArchived: query.includeArchived,
      search: query.search,
      assignedTo: query.assignedTo,
      countryCode: query.countryCode,
      cantonCode: query.cantonCode,
      municipality: query.municipality,
      withCounts: query.withCounts,
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
      "project:create",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(createProjectInputSchema, body);

    const project = await createProjectForWorkspace(workspace.id, userId, input);

    return successResponse({ project }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
