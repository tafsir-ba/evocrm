import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { reassignRecordsInputSchema } from "@/server/validation/reassignment";
import { reassignMembershipRecords } from "@/server/services/reassignment";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; membershipId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, membershipId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "users:manage",
    );

    const body = parseRequestOrThrow(
      reassignRecordsInputSchema,
      await request.json(),
    );

    const result = await reassignMembershipRecords({
      workspaceId: workspace.id,
      membershipId,
      actorId: userId,
      data: body,
    });

    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
