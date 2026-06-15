import { handleRouteError, successResponse } from "@/server/api/responses";
import { parseRequestOrThrow } from "@/server/validation/request";
import { deleteWorkspaceInputSchema } from "@/server/validation/workspace-deletion";
import { deleteWorkspaceForOwner } from "@/server/services/workspace-deletion";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(workspaceSlug);

    const body = parseRequestOrThrow(deleteWorkspaceInputSchema, await request.json());

    const result = await deleteWorkspaceForOwner({
      workspaceId: workspace.id,
      actorUserId: userId,
      confirmation: body,
    });

    return successResponse({
      deleted: true,
      slug: result.slug,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
