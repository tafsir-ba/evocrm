import "server-only";

import type { ProjectRoleKey } from "@/lib/project-sharing-roles";
import { connectDb } from "@/server/db/mongoose";
import {
  ProjectGrantModel,
  type ProjectGrantDocument,
} from "@/models/project-grant";

export type ProjectGrantRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  projectRole: ProjectRoleKey;
  status: "active" | "suspended" | "removed";
  grantedBy: string;
  revokedBy: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toProjectGrantRecord(document: ProjectGrantDocument): ProjectGrantRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    projectId: document.projectId.toString(),
    userId: document.userId.toString(),
    projectRole: document.projectRole as ProjectRoleKey,
    status: document.status as ProjectGrantRecord["status"],
    grantedBy: document.grantedBy.toString(),
    revokedBy: document.revokedBy?.toString() ?? null,
    revokedAt: document.revokedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findProjectGrant(
  workspaceId: string,
  projectId: string,
  userId: string,
): Promise<ProjectGrantRecord | null> {
  await connectDb();
  const doc = await ProjectGrantModel.findOne({
    workspaceId,
    projectId,
    userId,
  }).lean<ProjectGrantDocument>();
  return doc ? toProjectGrantRecord(doc) : null;
}

export async function findActiveProjectGrant(
  workspaceId: string,
  projectId: string,
  userId: string,
): Promise<ProjectGrantRecord | null> {
  await connectDb();
  const doc = await ProjectGrantModel.findOne({
    workspaceId,
    projectId,
    userId,
    status: "active",
  }).lean<ProjectGrantDocument>();
  return doc ? toProjectGrantRecord(doc) : null;
}

export async function findActiveProjectGrantsForUser(
  workspaceId: string,
  userId: string,
): Promise<ProjectGrantRecord[]> {
  await connectDb();
  const docs = await ProjectGrantModel.find({
    workspaceId,
    userId,
    status: "active",
  }).lean<ProjectGrantDocument[]>();
  return docs.map(toProjectGrantRecord);
}

export async function findActiveProjectGrantsForProject(
  workspaceId: string,
  projectId: string,
): Promise<ProjectGrantRecord[]> {
  await connectDb();
  const docs = await ProjectGrantModel.find({
    workspaceId,
    projectId,
    status: "active",
  })
    .sort({ createdAt: 1 })
    .lean<ProjectGrantDocument[]>();
  return docs.map(toProjectGrantRecord);
}

export async function countActiveProjectAdmins(
  workspaceId: string,
  projectId: string,
): Promise<number> {
  await connectDb();
  return ProjectGrantModel.countDocuments({
    workspaceId,
    projectId,
    projectRole: "project_admin",
    status: "active",
  });
}

export async function createProjectGrant(input: {
  workspaceId: string;
  projectId: string;
  userId: string;
  projectRole: ProjectRoleKey;
  grantedBy: string;
}): Promise<ProjectGrantRecord> {
  await connectDb();
  const doc = await ProjectGrantModel.create({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    userId: input.userId,
    projectRole: input.projectRole,
    status: "active",
    grantedBy: input.grantedBy,
  });
  return toProjectGrantRecord(doc.toObject() as ProjectGrantDocument);
}

export async function updateProjectGrantRole(
  workspaceId: string,
  projectId: string,
  userId: string,
  projectRole: ProjectRoleKey,
): Promise<ProjectGrantRecord | null> {
  await connectDb();
  const doc = await ProjectGrantModel.findOneAndUpdate(
    { workspaceId, projectId, userId, status: "active" },
    { $set: { projectRole } },
    { new: true },
  ).lean<ProjectGrantDocument>();
  return doc ? toProjectGrantRecord(doc) : null;
}

export async function revokeProjectGrant(
  workspaceId: string,
  projectId: string,
  userId: string,
  revokedBy: string,
): Promise<ProjectGrantRecord | null> {
  await connectDb();
  const doc = await ProjectGrantModel.findOneAndUpdate(
    { workspaceId, projectId, userId, status: "active" },
    {
      $set: {
        status: "removed",
        revokedBy,
        revokedAt: new Date(),
      },
    },
    { new: true },
  ).lean<ProjectGrantDocument>();
  return doc ? toProjectGrantRecord(doc) : null;
}

export async function reactivateProjectGrant(
  workspaceId: string,
  projectId: string,
  userId: string,
  projectRole: ProjectRoleKey,
  grantedBy: string,
): Promise<ProjectGrantRecord | null> {
  await connectDb();
  const doc = await ProjectGrantModel.findOneAndUpdate(
    { workspaceId, projectId, userId },
    {
      $set: {
        projectRole,
        status: "active",
        grantedBy,
        revokedBy: null,
        revokedAt: null,
      },
    },
    { new: true },
  ).lean<ProjectGrantDocument>();
  return doc ? toProjectGrantRecord(doc) : null;
}
