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
  createOpportunityInputSchema,
  opportunityListQuerySchema,
} from "@/server/validation/opportunities";
import {
  createOpportunityForWorkspace,
  listOpportunitiesForWorkspace,
} from "@/server/services/opportunities";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "opportunity:read",
    );

    const url = new URL(request.url);
    const queryResult = validateSearchParams(opportunityListQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const query = queryResult.data;
    const { opportunities, total } = await listOpportunitiesForWorkspace(workspace.id, {
      page: query.page,
      pageSize: query.pageSize,
      includeArchived: query.includeArchived,
      search: query.search,
      projectId: query.projectId,
      statusId: query.statusId,
      leadId: query.leadId,
      propertyId: query.propertyId,
      assignedTo: query.assignedTo,
      ownerId: query.ownerId,
      tagId: query.tagId,
      behavior: query.behavior,
      expectedCloseFrom: query.expectedCloseFrom,
      expectedCloseTo: query.expectedCloseTo,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      closedFrom: query.closedFrom,
      closedTo: query.closedTo,
    });

    return paginatedResponse(
      opportunities,
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
      "opportunity:create",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(createOpportunityInputSchema, body);

    const opportunity = await createOpportunityForWorkspace(workspace.id, userId, input);

    return successResponse({ opportunity }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
