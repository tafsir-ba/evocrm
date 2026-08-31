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
  createLeadApiInputSchema,
  leadListQuerySchema,
} from "@/server/validation/leads";
import {
  createLeadForWorkspace,
  listLeadsForWorkspace,
} from "@/server/services/leads";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(workspaceSlug, "lead:read");

    const url = new URL(request.url);
    const queryResult = validateSearchParams(leadListQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const query = queryResult.data;
    const { leads, total } = await listLeadsForWorkspace(workspace.id, {
      page: query.page,
      pageSize: query.pageSize,
      includeArchived: query.includeArchived,
      search: query.search,
      projectId: query.projectId,
      companyId: query.companyId,
      includeAssociated: query.includeAssociated,
      statusId: query.statusId,
      sourceId: query.sourceId,
      assignedTo: query.assignedTo,
      ownerId: query.ownerId,
      tagId: query.tagId,
      propertyTypeInterest: query.propertyTypeInterest,
      transactionIntent: query.transactionIntent,
      usagePurpose: query.usagePurpose,
      industry: query.industry,
      jobTitle: query.jobTitle,
      stateRegion: query.stateRegion,
      integrationId: query.integrationId,
      utmCampaign: query.utmCampaign,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    });

    return paginatedResponse(
      leads,
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
      "lead:create",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(createLeadApiInputSchema, body);

    const result = await createLeadForWorkspace(workspace.id, userId, input);

    return successResponse(
      {
        lead: result.lead,
        ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
