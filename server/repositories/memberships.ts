import "server-only";

import mongoose from "mongoose";

import { AppError } from "@/server/errors";
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
  if (!mongoose.isValidObjectId(userId)) {
    return [];
  }

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
  invitedBy?: string;
  joinedAt?: Date;
}): Promise<MembershipRecord> {
  await connectDb();
  const document = await MembershipModel.create({
    userId: input.userId,
    workspaceId: input.workspaceId,
    roleId: input.roleId,
    status: input.status,
    invitedBy: input.invitedBy,
    joinedAt: input.joinedAt,
  });

  return toMembershipRecord(document.toObject() as MembershipDocument);
}

export async function findMembershipByIdInWorkspace(
  membershipId: string,
  workspaceId: string,
): Promise<MembershipRecord | null> {
  await connectDb();
  const document = await MembershipModel.findOne({
    _id: membershipId,
    workspaceId,
  }).lean<MembershipDocument>();

  return document ? toMembershipRecord(document) : null;
}

export async function findMembershipsForWorkspace(
  workspaceId: string,
  filters?: { status?: MembershipStatus },
): Promise<MembershipRecord[]> {
  await connectDb();
  const query: Record<string, unknown> = { workspaceId };

  if (filters?.status) {
    query.status = filters.status;
  }

  const documents = await MembershipModel.find(query)
    .sort({ createdAt: 1 })
    .lean<MembershipDocument[]>();

  return documents.map(toMembershipRecord);
}

export async function updateMembership(
  membershipId: string,
  workspaceId: string,
  input: Partial<Pick<MembershipRecord, "roleId" | "status">>,
): Promise<MembershipRecord> {
  await connectDb();
  const document = await MembershipModel.findOneAndUpdate(
    { _id: membershipId, workspaceId },
    { $set: input },
    { new: true, runValidators: true },
  ).lean<MembershipDocument>();

  if (!document) {
    throw new AppError("NOT_FOUND", "Membership not found.");
  }

  return toMembershipRecord(document);
}

export async function reactivateMembership(input: {
  membershipId: string;
  workspaceId: string;
  roleId: string;
  invitedBy: string;
}): Promise<MembershipRecord> {
  await connectDb();
  const document = await MembershipModel.findOneAndUpdate(
    { _id: input.membershipId, workspaceId: input.workspaceId, status: "removed" },
    {
      $set: {
        roleId: input.roleId,
        status: "active",
        invitedBy: input.invitedBy,
        joinedAt: new Date(),
      },
    },
    { new: true, runValidators: true },
  ).lean<MembershipDocument>();

  if (!document) {
    throw new AppError("NOT_FOUND", "Removed membership not found.");
  }

  return toMembershipRecord(document);
}

export async function countActiveMembershipsWithRole(
  workspaceId: string,
  roleId: string,
): Promise<number> {
  await connectDb();
  return MembershipModel.countDocuments({
    workspaceId,
    roleId,
    status: "active",
  });
}

export async function countMembershipsWithRole(
  workspaceId: string,
  roleId: string,
  status?: MembershipStatus,
): Promise<number> {
  await connectDb();
  const query: Record<string, unknown> = { workspaceId, roleId };

  if (status) {
    query.status = status;
  }

  return MembershipModel.countDocuments(query);
}
