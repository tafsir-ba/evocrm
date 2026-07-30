import { handleRouteError, successResponse } from "@/server/api/responses";
import { getCampaignAnalyticsForWorkspace } from "@/server/services/campaign-analytics";
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

    const dateFromRaw = url.searchParams.get("dateFrom");
    const dateToRaw = url.searchParams.get("dateTo");

    const report = await getCampaignAnalyticsForWorkspace(workspace.id, campaignId, {
      period,
      dateFrom: dateFromRaw ? new Date(dateFromRaw) : undefined,
      dateTo: dateToRaw ? new Date(dateToRaw) : undefined,
    });

    return successResponse(report);
  } catch (error) {
    return handleRouteError(error);
  }
}
