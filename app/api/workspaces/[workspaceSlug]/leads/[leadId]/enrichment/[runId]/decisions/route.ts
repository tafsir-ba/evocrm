import { handleRouteError, successResponse } from "@/server/api/responses";
import { applyLeadEnrichmentDecisions } from "@/server/services/lead-enrichment";
import { parseRequestOrThrow } from "@/server/validation/request";
import { enrichmentDecisionSchema } from "@/server/validation/lead-enrichment";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; leadId: string; runId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId, runId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:enrich",
    );
    const input = parseRequestOrThrow(enrichmentDecisionSchema, await request.json());
    const run = await applyLeadEnrichmentDecisions({
      workspaceId: workspace.id,
      leadId,
      runId,
      actorId: userId,
      ...input,
    });
    return successResponse({ run });
  } catch (error) {
    return handleRouteError(error);
  }
}
