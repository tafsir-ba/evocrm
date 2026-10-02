import { handleRouteError, successResponse } from "@/server/api/responses";
import { syncMetaConnectionForWorkspace } from "@/server/services/advertising-meta-sync";
import { parseRequestOrThrow } from "@/server/validation/request";
import { syncMetaInputSchema } from "@/server/validation/advertising";
import { requireWorkspaceMemberApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { userId, workspace } = await requireWorkspaceMemberApiAccess(
      workspaceSlug,
      "advertising:connect",
    );
    const body: unknown = await request.json();
    const input = parseRequestOrThrow(syncMetaInputSchema, body);
    const result = await syncMetaConnectionForWorkspace({
      workspaceId: workspace.id,
      actorId: userId,
      connectionId: input.connectionId,
      growthCampaignId: input.growthCampaignId,
    });
    return successResponse({ sync: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
