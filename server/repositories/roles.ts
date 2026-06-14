import "server-only";

import { AppError } from "@/server/errors";
import { connectDb } from "@/server/db/mongoose";
import { RoleModel, type RoleDocument } from "@/models/role";
import type { PermissionKey } from "@/server/permissions/permissions";
import { validatePermissions } from "@/server/permissions/permissions";

export type RoleRecord = {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  permissions: PermissionKey[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toRoleRecord(document: RoleDocument): RoleRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    name: document.name,
    key: document.key,
    permissions: document.permissions as PermissionKey[],
    isSystem: document.isSystem,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findRoleById(roleId: string): Promise<RoleRecord | null> {
  await connectDb();
  const document = await RoleModel.findById(roleId).lean<RoleDocument>();
  return document ? toRoleRecord(document) : null;
}

export async function findRoleByIdInWorkspace(
  roleId: string,
  workspaceId: string,
): Promise<RoleRecord | null> {
  await connectDb();
  const document = await RoleModel.findOne({
    _id: roleId,
    workspaceId,
  }).lean<RoleDocument>();

  return document ? toRoleRecord(document) : null;
}

export async function findRolesForWorkspace(
  workspaceId: string,
): Promise<RoleRecord[]> {
  await connectDb();
  const documents = await RoleModel.find({ workspaceId })
    .sort({ isSystem: -1, name: 1 })
    .lean<RoleDocument[]>();

  return documents.map(toRoleRecord);
}

export async function findRoleByWorkspaceAndKey(
  workspaceId: string,
  key: string,
): Promise<RoleRecord | null> {
  await connectDb();
  const document = await RoleModel.findOne({
    workspaceId,
    key: key.toLowerCase().trim(),
  }).lean<RoleDocument>();
  return document ? toRoleRecord(document) : null;
}

export async function createRole(input: {
  workspaceId: string;
  name: string;
  key: string;
  permissions: PermissionKey[];
  isSystem: boolean;
}): Promise<RoleRecord> {
  await connectDb();
  const permissions = validatePermissions(input.permissions);

  const document = await RoleModel.create({
    workspaceId: input.workspaceId,
    name: input.name,
    key: input.key.toLowerCase().trim(),
    permissions,
    isSystem: input.isSystem,
  });

  return toRoleRecord(document.toObject() as RoleDocument);
}

export async function updateRole(
  roleId: string,
  workspaceId: string,
  input: Partial<Pick<RoleRecord, "name" | "permissions">>,
): Promise<RoleRecord> {
  await connectDb();

  if (input.permissions) {
    validatePermissions(input.permissions);
  }

  const document = await RoleModel.findOneAndUpdate(
    { _id: roleId, workspaceId },
    { $set: input },
    { new: true, runValidators: true },
  ).lean<RoleDocument>();

  if (!document) {
    throw new AppError("NOT_FOUND", "Role not found.");
  }

  return toRoleRecord(document);
}

export async function deleteRoleById(
  roleId: string,
  workspaceId: string,
): Promise<void> {
  await connectDb();
  const document = await RoleModel.findOne({
    _id: roleId,
    workspaceId,
  }).lean<RoleDocument>();

  if (!document) {
    throw new AppError("NOT_FOUND", "Role not found.");
  }

  if (document.isSystem) {
    throw new AppError("FORBIDDEN", "System roles cannot be deleted.");
  }

  await RoleModel.findOneAndDelete({ _id: roleId, workspaceId });
}
