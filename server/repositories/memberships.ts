import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { MembershipModel, type MembershipDocument } from "@/models/membership";
import type { MembershipStatus } from "@/server/permissions/types";

export type MembershipRecord = {
  id: string;
  userId: string;
  workspaceId: string;
  roleId: string;
  status: MembershipStatus;
  invitedBy?: string;
  joinedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

function toMembershipRecord(document: MembershipDocument): MembershipRecord {
  return {
    id: document._id.toString(),
    userId: document.userId.toString(),
    workspaceId: document.workspaceId.toString(),
    roleId: document.roleId.toString(),
    status: document.status,
    invitedBy: document.invitedBy?.toString(),
    joinedAt: document.joinedAt ?? undefined,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findMembership(
  userId: string,
  workspaceId: string,
): Promise<MembershipRecord | null> {
  await connectDb();
  const document = await MembershipModel.findOne({ userId, workspaceId }).lean<MembershipDocument>();
  return document ? toMembershipRecord(document) : null;
}

export async function findActiveMembershipsForUser(
  userId: string,
): Promise<MembershipRecord[]> {
  await connectDb();
  const documents = await MembershipModel.find({
    userId,
    status: "active",
  }).lean<MembershipDocument[]>();

  return documents.map(toMembershipRecord);
}

export async function findActiveMembershipsForWorkspace(
  workspaceId: string,
): Promise<MembershipRecord[]> {
  await connectDb();
  const documents = await MembershipModel.find({
    workspaceId,
    status: "active",
  }).lean<MembershipDocument[]>();

  return documents.map(toMembershipRecord);
}

export async function createMembership(input: {
  userId: string;
  workspaceId: string;
  roleId: string;
  status: MembershipStatus;
  joinedAt?: Date;
}): Promise<MembershipRecord> {
  await connectDb();
  const document = await MembershipModel.create({
    userId: input.userId,
    workspaceId: input.workspaceId,
    roleId: input.roleId,
    status: input.status,
    joinedAt: input.joinedAt,
  });

  return toMembershipRecord(document.toObject() as MembershipDocument);
}
