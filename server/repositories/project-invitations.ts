import "server-only";

import type { ProjectRoleKey } from "@/lib/project-sharing-roles";
import { connectDb } from "@/server/db/mongoose";
import {
  ProjectInvitationModel,
  type ProjectInvitationDocument,
} from "@/models/project-invitation";

export type ProjectInvitationRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  email: string;
  projectRole: ProjectRoleKey;
  status: "pending" | "accepted" | "expired" | "revoked";
  tokenHash: string;
  expiresAt: Date;
  invitedBy: string;
  acceptedBy: string | null;
  acceptedAt: Date | null;
  revokedBy: string | null;
  revokedAt: Date | null;
  lastResentAt: Date | null;
  message: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(doc: ProjectInvitationDocument): ProjectInvitationRecord {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    projectId: doc.projectId.toString(),
    email: doc.email,
    projectRole: doc.projectRole as ProjectRoleKey,
    status: doc.status as ProjectInvitationRecord["status"],
    tokenHash: doc.tokenHash,
    expiresAt: doc.expiresAt,
    invitedBy: doc.invitedBy.toString(),
    acceptedBy: doc.acceptedBy?.toString() ?? null,
    acceptedAt: doc.acceptedAt ?? null,
    revokedBy: doc.revokedBy?.toString() ?? null,
    revokedAt: doc.revokedAt ?? null,
    lastResentAt: doc.lastResentAt ?? null,
    message: doc.message ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function createProjectInvitation(input: {
  workspaceId: string;
  projectId: string;
  email: string;
  projectRole: ProjectRoleKey;
  tokenHash: string;
  expiresAt: Date;
  invitedBy: string;
  message?: string | null;
}): Promise<ProjectInvitationRecord> {
  await connectDb();
  const doc = await ProjectInvitationModel.create({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    email: input.email.toLowerCase().trim(),
    projectRole: input.projectRole,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
    invitedBy: input.invitedBy,
    message: input.message ?? null,
  });
  return toRecord(doc.toObject() as ProjectInvitationDocument);
}

export async function findInvitationByTokenHash(
  tokenHash: string,
): Promise<ProjectInvitationRecord | null> {
  await connectDb();
  const doc = await ProjectInvitationModel.findOne({ tokenHash }).lean<ProjectInvitationDocument>();
  return doc ? toRecord(doc) : null;
}

export async function findPendingInvitation(
  workspaceId: string,
  projectId: string,
  email: string,
): Promise<ProjectInvitationRecord | null> {
  await connectDb();
  const doc = await ProjectInvitationModel.findOne({
    workspaceId,
    projectId,
    email: email.toLowerCase().trim(),
    status: "pending",
  }).lean<ProjectInvitationDocument>();
  return doc ? toRecord(doc) : null;
}

export async function findInvitationByIdInProject(
  workspaceId: string,
  projectId: string,
  invitationId: string,
): Promise<ProjectInvitationRecord | null> {
  await connectDb();
  const doc = await ProjectInvitationModel.findOne({
    _id: invitationId,
    workspaceId,
    projectId,
  }).lean<ProjectInvitationDocument>();
  return doc ? toRecord(doc) : null;
}

export async function findInvitationsForProject(
  workspaceId: string,
  projectId: string,
): Promise<ProjectInvitationRecord[]> {
  await connectDb();
  const docs = await ProjectInvitationModel.find({
    workspaceId,
    projectId,
  })
    .sort({ createdAt: -1 })
    .lean<ProjectInvitationDocument[]>();
  return docs.map(toRecord);
}

export async function markInvitationAccepted(
  invitationId: string,
  acceptedBy: string,
): Promise<ProjectInvitationRecord | null> {
  await connectDb();
  const doc = await ProjectInvitationModel.findOneAndUpdate(
    { _id: invitationId, status: "pending" },
    {
      $set: {
        status: "accepted",
        acceptedBy,
        acceptedAt: new Date(),
      },
    },
    { new: true },
  ).lean<ProjectInvitationDocument>();
  return doc ? toRecord(doc) : null;
}

export async function revokeInvitation(
  invitationId: string,
  revokedBy: string,
): Promise<ProjectInvitationRecord | null> {
  await connectDb();
  const doc = await ProjectInvitationModel.findOneAndUpdate(
    { _id: invitationId, status: "pending" },
    {
      $set: {
        status: "revoked",
        revokedBy,
        revokedAt: new Date(),
      },
    },
    { new: true },
  ).lean<ProjectInvitationDocument>();
  return doc ? toRecord(doc) : null;
}

export async function updateInvitationTokenForResend(
  invitationId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<ProjectInvitationRecord | null> {
  await connectDb();
  const doc = await ProjectInvitationModel.findOneAndUpdate(
    { _id: invitationId, status: "pending" },
    {
      $set: {
        tokenHash,
        expiresAt,
        lastResentAt: new Date(),
      },
    },
    { new: true },
  ).lean<ProjectInvitationDocument>();
  return doc ? toRecord(doc) : null;
}
