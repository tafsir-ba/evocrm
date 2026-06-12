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

export async function deleteRoleById(roleId: string): Promise<void> {
  await connectDb();
  const document = await RoleModel.findById(roleId).lean<RoleDocument>();

  if (!document) {
    throw new AppError("NOT_FOUND", "Role not found.");
  }

  if (document.isSystem) {
    throw new AppError("FORBIDDEN", "System roles cannot be deleted.");
  }

  await RoleModel.findByIdAndDelete(roleId);
}
