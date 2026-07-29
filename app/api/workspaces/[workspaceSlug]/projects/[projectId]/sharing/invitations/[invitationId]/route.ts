import { handleRouteError, successResponse } from "@/server/api/responses";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import { requireProjectAccess } from "@/server/permissions/require-project-access";
import {
  resendProjectInvitation,
  revokeProjectInvitation,
} from "@/server/services/project-invitations";
import { parseRequestOrThrow } from "@/server/validation/request";
import { z } from "zod";

type RouteContext = {
  params: Promise<{
    workspaceSlug: string;
    projectId: string;
    invitationId: string;
  }>;
};

const actionSchema = z.object({
  action: z.enum(["resend", "revoke"]),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, projectId, invitationId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(workspaceSlug);
    const access = await requireProjectAccess(workspace.id, userId, projectId);

    if (access.projectRole !== "project_admin" && !access.isWorkspaceAdmin) {
      const { AppError } = await import("@/server/errors");
      throw new AppError("PERMISSION_DENIED", "Only Project Admins can manage invitations.");
    }

    const body = parseRequestOrThrow(actionSchema, await request.json());

    if (body.action === "resend") {
      const updated = await resendProjectInvitation({
        workspaceId: workspace.id,
        invitationId,
        actorId: userId,
      });
      return successResponse(updated);
    }

    await revokeProjectInvitation({
      workspaceId: workspace.id,
      invitationId,
      actorId: userId,
    });

    return successResponse({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
