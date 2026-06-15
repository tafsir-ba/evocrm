import {
  buildPaginationMeta,
  handleRouteError,
  paginatedResponse,
} from "@/server/api/responses";
import { validateSearchParams } from "@/server/validation/request";
import { campaignEnrollmentCandidatesQuerySchema } from "@/server/validation/campaign-enrollments";
import { listEnrollmentCandidatesForWorkspace } from "@/server/services/campaign-enrollments";
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
      campaignEnrollmentCandidatesQuerySchema,
      url.searchParams,
    );

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const query = queryResult.data;
    const { candidates, total } = await listEnrollmentCandidatesForWorkspace(
      workspace.id,
      campaignId,
      {
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
      },
    );

    return paginatedResponse(
      candidates,
      buildPaginationMeta(query.page, query.pageSize, total),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
