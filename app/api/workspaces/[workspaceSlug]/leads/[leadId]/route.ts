import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateLeadInputSchema } from "@/server/validation/leads";
import {
  archiveLeadForWorkspace,
  getLeadForWorkspace,
  updateLeadForWorkspace,
} from "@/server/services/leads";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; leadId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(workspaceSlug, "lead:read");

    const lead = await getLeadForWorkspace(workspace.id, leadId);

    return successResponse({ lead });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:update",
    );

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateLeadInputSchema, body);

    const result = await updateLeadForWorkspace(
      workspace.id,
      leadId,
      userId,
      input,
    );

    return successResponse({
      lead: result.lead,
      ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:archive",
    );

    const lead = await archiveLeadForWorkspace(workspace.id, leadId, userId);

    return successResponse({ lead });
  } catch (error) {
    return handleRouteError(error);
  }
}
