import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  getLeadEnrichmentForLead,
  revokeLeadEnrichment,
  startLeadEnrichment,
} from "@/server/services/lead-enrichment";
import { parseRequestOrThrow } from "@/server/validation/request";
import { startLeadEnrichmentSchema } from "@/server/validation/lead-enrichment";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; leadId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(workspaceSlug, [
      "lead:enrich",
      "lead:read",
    ]);
    const payload = await getLeadEnrichmentForLead(workspace.id, leadId);
    return successResponse(payload);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:enrich",
    );
    let raw: unknown = {};
    try {
      const text = await request.text();
      raw = text.trim() ? (JSON.parse(text) as unknown) : {};
    } catch {
      raw = {};
    }
    const input = parseRequestOrThrow(startLeadEnrichmentSchema, raw);
    const run = await startLeadEnrichment({
      workspaceId: workspace.id,
      leadId,
      actorId: userId,
      allowedSources: input.allowedSources,
    });
    return successResponse({ run });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:enrich_revoke",
    );
    const result = await revokeLeadEnrichment({
      workspaceId: workspace.id,
      leadId,
      actorId: userId,
    });
    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
