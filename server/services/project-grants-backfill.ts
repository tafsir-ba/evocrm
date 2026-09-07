import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { MembershipModel } from "@/models/membership";
import { ProjectModel } from "@/models/project";
import { RoleModel } from "@/models/role";
import {
  createProjectGrant,
  findProjectGrant,
  reactivateProjectGrant,
} from "@/server/repositories/project-grants";
import type { ProjectRoleKey } from "@/lib/project-sharing-roles";

const WORKSPACE_ADMIN_KEYS = new Set(["owner", "admin"]);

export type ProjectGrantsBackfillResult = {
  dryRun: boolean;
  projectsScanned: number;
  creatorGrantsCreated: number;
  memberGrantsCreated: number;
  grantsReactivated: number;
  skipped: number;
};

export async function backfillProjectGrants(input: {
  dryRun: boolean;
}): Promise<ProjectGrantsBackfillResult> {
  await connectDb();

  const projects = await ProjectModel.find({})
    .select({ _id: 1, workspaceId: 1, createdBy: 1 })
    .lean<Array<{ _id: unknown; workspaceId: unknown; createdBy: unknown }>>();

  const result: ProjectGrantsBackfillResult = {
    dryRun: input.dryRun,
    projectsScanned: projects.length,
    creatorGrantsCreated: 0,
    memberGrantsCreated: 0,
    grantsReactivated: 0,
    skipped: 0,
  };

  const roles = await RoleModel.find({})
    .select({ _id: 1, workspaceId: 1, key: 1, permissions: 1 })
    .lean<
      Array<{
        _id: unknown;
        workspaceId: unknown;
        key?: string;
        permissions?: string[];
      }>
    >();

  const roleById = new Map(
    roles.map((role) => [
      String(role._id),
      {
        key: role.key ?? "",
        permissions: role.permissions ?? [],
        workspaceId: String(role.workspaceId),
      },
    ]),
  );

  const memberships = await MembershipModel.find({ status: "active" })
    .select({ userId: 1, workspaceId: 1, roleId: 1 })
    .lean<Array<{ userId: unknown; workspaceId: unknown; roleId: unknown }>>();

  const membersByWorkspace = new Map<
    string,
    Array<{ userId: string; roleKey: string; permissions: string[] }>
  >();

  for (const membership of memberships) {
    const workspaceId = String(membership.workspaceId);
    const role = roleById.get(String(membership.roleId));
    if (!role || role.workspaceId !== workspaceId) {
      continue;
    }
    if (WORKSPACE_ADMIN_KEYS.has(role.key)) {
      continue;
    }
    const list = membersByWorkspace.get(workspaceId) ?? [];
    list.push({
      userId: String(membership.userId),
      roleKey: role.key,
      permissions: role.permissions,
    });
    membersByWorkspace.set(workspaceId, list);
  }

  async function ensureGrant(inputGrant: {
    workspaceId: string;
    projectId: string;
    userId: string;
    projectRole: ProjectRoleKey;
    grantedBy: string;
    counter: "creatorGrantsCreated" | "memberGrantsCreated";
  }): Promise<void> {
    const existing = await findProjectGrant(
      inputGrant.workspaceId,
      inputGrant.projectId,
      inputGrant.userId,
    );

    if (existing?.status === "active") {
      result.skipped += 1;
      return;
    }

    if (input.dryRun) {
      result[inputGrant.counter] += 1;
      return;
    }

    if (existing?.status === "removed") {
      await reactivateProjectGrant(
        inputGrant.workspaceId,
        inputGrant.projectId,
        inputGrant.userId,
        inputGrant.projectRole,
        inputGrant.grantedBy,
      );
      result.grantsReactivated += 1;
      return;
    }

    await createProjectGrant({
      workspaceId: inputGrant.workspaceId,
      projectId: inputGrant.projectId,
      userId: inputGrant.userId,
      projectRole: inputGrant.projectRole,
      grantedBy: inputGrant.grantedBy,
    });
    result[inputGrant.counter] += 1;
  }

  for (const project of projects) {
    const workspaceId = String(project.workspaceId);
    const projectId = String(project._id);
    const createdBy = String(project.createdBy);

    await ensureGrant({
      workspaceId,
      projectId,
      userId: createdBy,
      projectRole: "project_admin",
      grantedBy: createdBy,
      counter: "creatorGrantsCreated",
    });

    const members = membersByWorkspace.get(workspaceId) ?? [];
    for (const member of members) {
      if (member.userId === createdBy) {
        continue;
      }
      const projectRole: ProjectRoleKey = member.permissions.includes("project:update")
        ? "contributor"
        : "viewer";
      await ensureGrant({
        workspaceId,
        projectId,
        userId: member.userId,
        projectRole,
        grantedBy: createdBy,
        counter: "memberGrantsCreated",
      });
    }
  }

  return result;
}
