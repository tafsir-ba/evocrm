import { handleRouteError, successResponse } from "@/server/api/responses";
import { selectLeadEnrichmentCandidate } from "@/server/services/lead-enrichment";
import { parseRequestOrThrow } from "@/server/validation/request";
import { selectEnrichmentCandidateSchema } from "@/server/validation/lead-enrichment";
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
    const input = parseRequestOrThrow(selectEnrichmentCandidateSchema, await request.json());
    const run = await selectLeadEnrichmentCandidate({
      workspaceId: workspace.id,
      leadId,
      runId,
      actorId: userId,
      candidateId: input.candidateId,
    });
    return successResponse({ run });
  } catch (error) {
    return handleRouteError(error);
  }
}
