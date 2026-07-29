import { handleRouteError, successResponse } from "@/server/api/responses";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import { requireProjectAccess } from "@/server/permissions/require-project-access";
import {
  listProjectGrantsForProject,
  addProjectGrant,
  changeProjectGrantRole,
  removeProjectGrant,
} from "@/server/services/project-grants";
import {
  listProjectInvitations,
  sendProjectInvitation,
} from "@/server/services/project-invitations";
import { parseRequestOrThrow } from "@/server/validation/request";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
};

const sendInviteSchema = z.object({
  email: z.string().email().trim().max(254),
  projectRole: z.enum(["project_admin", "contributor", "viewer"]),
  message: z.string().trim().max(500).optional(),
});

const changeRoleSchema = z.object({
  userId: z.string().trim().min(1),
  projectRole: z.enum(["project_admin", "contributor", "viewer"]),
});

const removeGrantSchema = z.object({
  userId: z.string().trim().min(1),
});

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, projectId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(workspaceSlug);
    await requireProjectAccess(workspace.id, userId, projectId, "project:read");

    const [grants, invitations] = await Promise.all([
      listProjectGrantsForProject(workspace.id, projectId),
      listProjectInvitations(workspace.id, projectId),
    ]);

    return successResponse({ grants, invitations });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, projectId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(workspaceSlug);
    const access = await requireProjectAccess(workspace.id, userId, projectId);

    if (access.projectRole !== "project_admin" && !access.isWorkspaceAdmin) {
      const { AppError } = await import("@/server/errors");
      throw new AppError("PERMISSION_DENIED", "Only Project Admins can invite collaborators.");
    }

    const body = parseRequestOrThrow(sendInviteSchema, await request.json());

    const result = await sendProjectInvitation({
      workspaceId: workspace.id,
      projectId,
      email: body.email,
      projectRole: body.projectRole,
      actorId: userId,
      message: body.message,
    });

    return successResponse(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, projectId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(workspaceSlug);
    const access = await requireProjectAccess(workspace.id, userId, projectId);

    if (access.projectRole !== "project_admin" && !access.isWorkspaceAdmin) {
      const { AppError } = await import("@/server/errors");
      throw new AppError("PERMISSION_DENIED", "Only Project Admins can change roles.");
    }

    const body = parseRequestOrThrow(changeRoleSchema, await request.json());

    const updated = await changeProjectGrantRole({
      workspaceId: workspace.id,
      projectId,
      targetUserId: body.userId,
      newRole: body.projectRole,
      actorId: userId,
    });

    return successResponse(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug, projectId } = await context.params;
    const { workspace, userId } = await requireWorkspaceApiAccess(workspaceSlug);
    const access = await requireProjectAccess(workspace.id, userId, projectId);

    if (access.projectRole !== "project_admin" && !access.isWorkspaceAdmin) {
      const { AppError } = await import("@/server/errors");
      throw new AppError("PERMISSION_DENIED", "Only Project Admins can remove access.");
    }

    const body = parseRequestOrThrow(removeGrantSchema, await request.json());

    await removeProjectGrant({
      workspaceId: workspace.id,
      projectId,
      targetUserId: body.userId,
      actorId: userId,
    });

    return successResponse({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
