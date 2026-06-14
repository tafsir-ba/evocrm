import {
  buildPaginationMeta,
  handleRouteError,
  paginatedResponse,
} from "@/server/api/responses";
import { validateSearchParams } from "@/server/validation/request";
import { campaignSendListQuerySchema } from "@/server/validation/campaigns";
import { listCampaignSendsForWorkspace } from "@/server/services/campaign-sending";
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
      campaignSendListQuerySchema,
      url.searchParams,
    );

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const query = queryResult.data;
    const { sends, total } = await listCampaignSendsForWorkspace(
      workspace.id,
      campaignId,
      {
        status: query.status,
        page: query.page,
        pageSize: query.pageSize,
      },
    );

    return paginatedResponse(
      sends,
      buildPaginationMeta(query.page, query.pageSize, total),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
