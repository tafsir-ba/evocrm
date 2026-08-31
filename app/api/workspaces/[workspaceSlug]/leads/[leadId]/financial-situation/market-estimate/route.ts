import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  markMarketIncomeReviewed,
  requestMarketIncomeEstimate,
} from "@/server/services/lead-financial-situation";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; leadId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:financial_update",
    );
    const body = (await request.json().catch(() => ({}))) as { review?: boolean };
    const record = body.review
      ? await markMarketIncomeReviewed({
          workspaceId: workspace.id,
          leadId,
          actorId: userId,
        })
      : await requestMarketIncomeEstimate({
          workspaceId: workspace.id,
          leadId,
          actorId: userId,
          defaultCurrency: workspace.defaultCurrency,
        });
    return successResponse({ record });
  } catch (error) {
    return handleRouteError(error);
  }
}
