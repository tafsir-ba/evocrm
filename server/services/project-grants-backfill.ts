import "server-only";

import type { ProjectRoleKey } from "@/lib/project-sharing-roles";
import { connectDb } from "@/server/db/mongoose";
import { AppError } from "@/server/errors";
import { findActiveMembershipsForWorkspace } from "@/server/repositories/memberships";
import {
  createProjectGrant,
  findProjectGrant,
  reactivateProjectGrant,
} from "@/server/repositories/project-grants";
import { findProjects } from "@/server/repositories/projects";
import { findRoleByIdInWorkspace } from "@/server/repositories/roles";
import { findAllWorkspaces, findWorkspaceById } from "@/server/repositories/workspaces";

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const PLACEHOLDER_ACTOR_ID = "000000000000000000000001";
const WORKSPACE_ADMIN_ROLE_KEYS = new Set(["owner", "admin"]);

export type ProjectGrantsBackfillResult = {
  dryRun: boolean;
  workspaces: number;
  projects: number;
  creatorGrantsCreated: number;
  creatorGrantsReactivated: number;
  creatorGrantsSkipped: number;
  memberGrantsCreated: number;
  memberGrantsReactivated: number;
  memberGrantsSkipped: number;
};

async function ensureGrant(input: {
  workspaceId: string;
  projectId: string;
  userId: string;
  projectRole: ProjectRoleKey;
  grantedBy: string;
  dryRun: boolean;
}): Promise<"created" | "reactivated" | "skipped"> {
  const existing = await findProjectGrant(
    input.workspaceId,
    input.projectId,
    input.userId,
  );

  if (existing?.status === "active") {
    return "skipped";
  }

  if (input.dryRun) {
    return existing ? "reactivated" : "created";
  }

  if (existing) {
    const reactivated = await reactivateProjectGrant(
      input.workspaceId,
      input.projectId,
      input.userId,
      input.projectRole,
      input.grantedBy,
    );
    if (!reactivated) {
      throw new AppError("INTERNAL_ERROR", "Failed to reactivate project grant.");
    }
    return "reactivated";
  }

  await createProjectGrant({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    userId: input.userId,
    projectRole: input.projectRole,
    grantedBy: input.grantedBy,
  });
  return "created";
}

export async function backfillProjectGrants(options: {
  workspaceId?: string;
  actorId: string;
  dryRun?: boolean;
}): Promise<ProjectGrantsBackfillResult> {
  const dryRun = options.dryRun ?? false;
  if (
    !dryRun &&
    (!OBJECT_ID_PATTERN.test(options.actorId) || options.actorId === PLACEHOLDER_ACTOR_ID)
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Backfill requires a real --actor-id (24-character hex user ObjectId).",
    );
  }

  await connectDb();

  const workspaceRecords = (
    options.workspaceId !== undefined
      ? [await findWorkspaceById(options.workspaceId)]
      : await findAllWorkspaces()
  ).filter((workspace): workspace is NonNullable<typeof workspace> => Boolean(workspace));

  if (options.workspaceId && workspaceRecords.length === 0) {
    throw new AppError("NOT_FOUND", "Workspace not found.");
  }

  const result: ProjectGrantsBackfillResult = {
    dryRun,
    workspaces: workspaceRecords.length,
    projects: 0,
    creatorGrantsCreated: 0,
    creatorGrantsReactivated: 0,
    creatorGrantsSkipped: 0,
    memberGrantsCreated: 0,
    memberGrantsReactivated: 0,
    memberGrantsSkipped: 0,
  };

  for (const workspace of workspaceRecords) {
    const projects = await findProjects(workspace.id, { includeArchived: true });
    result.projects += projects.length;

    const memberships = await findActiveMembershipsForWorkspace(workspace.id);
    const roleCache = new Map<
      string,
      { key: string; permissions: string[] } | null
    >();

    async function resolveMembershipRole(roleId: string) {
      if (roleCache.has(roleId)) {
        return roleCache.get(roleId) ?? null;
      }
      const role = await findRoleByIdInWorkspace(roleId, workspace.id);
      const value = role
        ? { key: role.key, permissions: role.permissions as string[] }
        : null;
      roleCache.set(roleId, value);
      return value;
    }

    for (const project of projects) {
      const creatorOutcome = await ensureGrant({
        workspaceId: workspace.id,
        projectId: project.id,
        userId: project.createdBy,
        projectRole: "project_admin",
        grantedBy: options.actorId,
        dryRun,
      });
      if (creatorOutcome === "created") {
        result.creatorGrantsCreated += 1;
      } else if (creatorOutcome === "reactivated") {
        result.creatorGrantsReactivated += 1;
      } else {
        result.creatorGrantsSkipped += 1;
      }

      for (const membership of memberships) {
        if (membership.userId === project.createdBy) {
          continue;
        }

        const role = await resolveMembershipRole(membership.roleId);
        if (!role) {
          continue;
        }

        if (WORKSPACE_ADMIN_ROLE_KEYS.has(role.key)) {
          continue;
        }

        const projectRole: ProjectRoleKey = role.permissions.includes("project:update")
          ? "contributor"
          : "viewer";

        const memberOutcome = await ensureGrant({
          workspaceId: workspace.id,
          projectId: project.id,
          userId: membership.userId,
          projectRole,
          grantedBy: options.actorId,
          dryRun,
        });
        if (memberOutcome === "created") {
          result.memberGrantsCreated += 1;
        } else if (memberOutcome === "reactivated") {
          result.memberGrantsReactivated += 1;
        } else {
          result.memberGrantsSkipped += 1;
        }
      }
    }
  }

  return result;
}
