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
  createPropertyInputSchema,
  propertyListQuerySchema,
} from "@/server/validation/properties";
import {
  createPropertyForWorkspace,
  listPropertiesForWorkspace,
} from "@/server/services/properties";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(workspaceSlug, "property:read");

    const url = new URL(request.url);
    const queryResult = validateSearchParams(propertyListQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const query = queryResult.data;
    const { properties, total } = await listPropertiesForWorkspace(workspace.id, {
      page: query.page,
      pageSize: query.pageSize,
      includeArchived: query.includeArchived,
      search: query.search,
      statusId: query.statusId,
      typeId: query.typeId,
      projectId: query.projectId,
      assignedTo: query.assignedTo,
      ownerId: query.ownerId,
      tagId: query.tagId,
      city: query.city,
      country: query.country,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    });

    return paginatedResponse(
      properties,
      buildPaginationMeta(query.page, query.pageSize, total),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "property:create",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(createPropertyInputSchema, body);

    const property = await createPropertyForWorkspace(
      workspace.id,
      userId,
      input,
      workspace.defaultCurrency,
    );

    return successResponse({ property }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
