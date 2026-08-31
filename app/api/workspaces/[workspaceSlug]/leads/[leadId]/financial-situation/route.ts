import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  deleteFinancialSituationForLead,
  getFinancialSituationForLead,
  updateFinancialSituationForLead,
} from "@/server/services/lead-financial-situation";
import { emptyFinancialSnapshot } from "@/lib/lead-financial-situation";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateFinancialSituationSchema } from "@/server/validation/lead-financial-situation";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; leadId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:financial_read",
    );
    const payload = await getFinancialSituationForLead(
      workspace.id,
      leadId,
      workspace.defaultCurrency,
    );
    return successResponse(payload);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:financial_update",
    );
    const input = parseRequestOrThrow(updateFinancialSituationSchema, await request.json());
    const current = await getFinancialSituationForLead(
      workspace.id,
      leadId,
      workspace.defaultCurrency,
    );
    const snapshot = {
      ...emptyFinancialSnapshot(workspace.defaultCurrency),
      ...current.snapshot,
      ...input,
    };
    const record = await updateFinancialSituationForLead({
      workspaceId: workspace.id,
      leadId,
      actorId: userId,
      snapshot,
    });
    return successResponse({ record });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:financial_delete",
    );
    await deleteFinancialSituationForLead({
      workspaceId: workspace.id,
      leadId,
      actorId: userId,
    });
    return successResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
