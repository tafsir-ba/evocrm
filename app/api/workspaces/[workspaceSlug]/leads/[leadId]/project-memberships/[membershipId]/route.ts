import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { updateLeadProjectMembershipInputSchema } from "@/server/validation/lead-project-memberships";
import {
  listLeadProjectMemberships,
  removeLeadProjectMembership,
  setLeadProjectMembershipPrimary,
} from "@/server/services/lead-project-memberships";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; leadId: string; membershipId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId, membershipId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:update",
    );
    const body: unknown = await request.json();
    const input = parseRequestOrThrow(updateLeadProjectMembershipInputSchema, body);

    if (input.isPrimary !== true) {
      const memberships = await listLeadProjectMemberships(workspace.id, leadId);
      return successResponse({ memberships });
    }

    const memberships = await setLeadProjectMembershipPrimary({
      workspaceId: workspace.id,
      leadId,
      membershipId,
      actorId: userId,
    });
    return successResponse({ memberships });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId, membershipId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:update",
    );
    const memberships = await removeLeadProjectMembership({
      workspaceId: workspace.id,
      leadId,
      membershipId,
      actorId: userId,
    });
    return successResponse({ memberships });
  } catch (error) {
    return handleRouteError(error);
  }
}
