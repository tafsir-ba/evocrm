import {
  buildPaginationMeta,
  handleRouteError,
  paginatedResponse,
} from "@/server/api/responses";
import {
  getCampaignAnalyticsForWorkspace,
  listCampaignAnalyticsIssuesForWorkspace,
} from "@/server/services/campaign-analytics";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import type { CampaignAnalyticsPeriodPreset } from "@/lib/campaign-analytics";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; campaignId: string }>;
};

const PERIODS = new Set(["7d", "30d", "90d", "all"]);

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, campaignId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:read",
    );

    const url = new URL(request.url);
    const periodParam = url.searchParams.get("period") ?? "30d";
    const period = (
      PERIODS.has(periodParam) ? periodParam : "30d"
    ) as CampaignAnalyticsPeriodPreset;
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25),
    );

    // Reuse period resolution from the main analytics report.
    const report = await getCampaignAnalyticsForWorkspace(workspace.id, campaignId, {
      period,
    });

    const { issues, total } = await listCampaignAnalyticsIssuesForWorkspace(
      workspace.id,
      campaignId,
      {
        from: new Date(report.period.from),
        to: new Date(report.period.to),
        page,
        pageSize,
      },
    );

    return paginatedResponse(issues, buildPaginationMeta(page, pageSize, total));
  } catch (error) {
    return handleRouteError(error);
  }
}
