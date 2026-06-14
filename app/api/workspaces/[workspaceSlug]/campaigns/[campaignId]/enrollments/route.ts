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
  campaignEnrollmentListQuerySchema,
  createCampaignEnrollmentInputSchema,
} from "@/server/validation/campaign-enrollments";
import {
  createCampaignEnrollmentForWorkspace,
  listCampaignEnrollmentsForWorkspace,
} from "@/server/services/campaign-enrollments";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:read",
    );

    const url = new URL(request.url);
    const queryResult = validateSearchParams(
      campaignEnrollmentListQuerySchema,
      url.searchParams,
    );

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const query = queryResult.data;
    const { enrollments, total } = await listCampaignEnrollmentsForWorkspace(
      workspace.id,
      campaignId,
      {
        status: query.status,
        page: query.page,
        pageSize: query.pageSize,
      },
    );

    return paginatedResponse(
      enrollments,
      buildPaginationMeta(query.page, query.pageSize, total),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(createCampaignEnrollmentInputSchema, body);

    const enrollment = await createCampaignEnrollmentForWorkspace(
      workspace.id,
      userId,
      campaignId,
      input,
    );

    return successResponse({ enrollment }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
