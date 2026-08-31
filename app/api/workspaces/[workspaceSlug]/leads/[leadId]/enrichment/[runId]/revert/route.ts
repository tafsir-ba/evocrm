import { handleRouteError, successResponse } from "@/server/api/responses";
import { revertLeadEnrichmentRun } from "@/server/services/lead-enrichment";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; leadId: string; runId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId, runId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:enrich",
    );
    const run = await revertLeadEnrichmentRun({
      workspaceId: workspace.id,
      leadId,
      runId,
      actorId: userId,
    });
    return successResponse({ run });
  } catch (error) {
    return handleRouteError(error);
  }
}
