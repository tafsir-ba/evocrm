import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { createLeadProjectMembershipInputSchema } from "@/server/validation/lead-project-memberships";
import {
  addLeadProjectMembership,
  listLeadProjectMemberships,
} from "@/server/services/lead-project-memberships";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; leadId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(workspaceSlug, "lead:read");
    const memberships = await listLeadProjectMemberships(workspace.id, leadId);
    return successResponse({ memberships });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, leadId } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "lead:update",
    );
    const body: unknown = await request.json();
    const input = parseRequestOrThrow(createLeadProjectMembershipInputSchema, body);
    const memberships = await addLeadProjectMembership({
      workspaceId: workspace.id,
      leadId,
      actorId: userId,
      projectId: input.projectId,
      isPrimary: input.isPrimary,
      joinedAt: input.joinedAt,
      source: "manual",
    });
    return successResponse({ memberships }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
