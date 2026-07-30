import {
  buildPaginationMeta,
  handleRouteError,
  paginatedResponse,
} from "@/server/api/responses";
import {
  listCampaignAnalyticsIssuesForWorkspace,
  resolveCampaignAnalyticsPeriod,
} from "@/server/services/campaign-analytics";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import { parseCampaignAnalyticsPeriod } from "@/lib/campaign-analytics";

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
    const period = parseCampaignAnalyticsPeriod(url.searchParams.get("period"));
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25),
    );

    const resolved = await resolveCampaignAnalyticsPeriod(workspace.id, campaignId, {
      period,
    });

    const { issues, total } = await listCampaignAnalyticsIssuesForWorkspace(
      workspace.id,
      campaignId,
      {
        from: resolved.from,
        to: resolved.to,
        page,
        pageSize,
      },
    );

    return paginatedResponse(issues, buildPaginationMeta(page, pageSize, total));
  } catch (error) {
    return handleRouteError(error);
  }
}
