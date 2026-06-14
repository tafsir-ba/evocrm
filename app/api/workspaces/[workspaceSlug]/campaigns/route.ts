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
  campaignListQuerySchema,
  createCampaignInputSchema,
} from "@/server/validation/campaigns";
import {
  createCampaignForWorkspace,
  listCampaignsForWorkspace,
} from "@/server/services/campaigns";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:read",
    );

    const url = new URL(request.url);
    const queryResult = validateSearchParams(campaignListQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const query = queryResult.data;
    const { campaigns, total } = await listCampaignsForWorkspace(workspace.id, {
      page: query.page,
      pageSize: query.pageSize,
      includeArchived: query.includeArchived,
      status: query.status,
      audienceType: query.audienceType,
      search: query.search,
    });

    return paginatedResponse(
      campaigns,
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
      "campaign:create",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(createCampaignInputSchema, body);

    const campaign = await createCampaignForWorkspace(workspace.id, userId, input);

    return successResponse({ campaign }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
