import { handleRouteError, successResponse } from "@/server/api/responses";
import { getGrowthCampaignOverviewForWorkspace } from "@/server/services/advertising-meta-sync";
import { requireWorkspaceMemberApiAccess } from "@/server/workspaces/require-workspace-api-access";
import { validateSearchParams } from "@/server/validation/request";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

const querySchema = z.object({
  projectId: z.string().min(1),
});

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceMemberApiAccess(
      workspaceSlug,
      "advertising:read",
    );
    const url = new URL(request.url);
    const query = validateSearchParams(querySchema, url.searchParams);
    if (!query.success) {
      throw query.error;
    }
    const overview = await getGrowthCampaignOverviewForWorkspace({
      workspaceId: workspace.id,
      projectId: query.data.projectId,
    });
    return successResponse({ overview });
  } catch (error) {
    return handleRouteError(error);
  }
}
