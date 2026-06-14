import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { PERMISSION_KEYS } from "@/server/permissions/permissions";
import { DEFAULT_ROLE_DEFINITIONS, isSystemRoleKey } from "@/server/permissions/roles";
import {
  countMembershipsWithRole,
} from "@/server/repositories/memberships";
import {
  createRole,
  deleteRoleById,
  findRoleByIdInWorkspace,
  findRoleByWorkspaceAndKey,
  findRolesForWorkspace,
  updateRole,
  type RoleRecord,
} from "@/server/repositories/roles";
import type {
  CreateRoleInput,
  UpdateRoleInput,
} from "@/server/validation/roles";

export async function seedDefaultRolesForWorkspace(
  workspaceId: string,
  actorId: string,
): Promise<RoleRecord[]> {
  const roles: RoleRecord[] = [];

  for (const definition of DEFAULT_ROLE_DEFINITIONS) {
    const role = await createRole({
      workspaceId,
      name: definition.name,
      key: definition.key,
      permissions: definition.permissions,
      isSystem: definition.isSystem,
    });
    roles.push(role);
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "role.defaults_created",
    entityType: "role",
    entityId: workspaceId,
    after: { keys: roles.map((role) => role.key) },
  });

  return roles;
}

export async function findOwnerRole(workspaceId: string): Promise<RoleRecord | null> {
  return findRoleByWorkspaceAndKey(workspaceId, "owner");
}

export type RoleListItem = {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  isSystem: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PermissionGroup = {
  module: string;
  permissions: { key: string; label: string }[];
};

const PERMISSION_LABELS: Record<string, string> = {
  "dashboard:read": "View dashboard",
  "lead:create": "Create leads",
  "lead:read": "View leads",
  "lead:update": "Edit leads",
  "lead:archive": "Archive leads",
  "property:create": "Create properties",
  "property:read": "View properties",
  "property:update": "Edit properties",
  "property:archive": "Archive properties",
  "opportunity:create": "Create opportunities",
  "opportunity:read": "View opportunities / pipeline",
  "opportunity:update": "Edit opportunities",
  "opportunity:archive": "Archive opportunities",
  "activity:create": "Create activities",
  "activity:read": "View activities",
  "activity:update": "Edit activities",
  "activity:archive": "Archive activities",
  "document:create": "Upload documents",
  "document:read": "View documents",
  "document:archive": "Archive documents",
  "campaign:create": "Create campaigns",
  "campaign:read": "View campaigns",
  "campaign:update": "Edit campaigns",
  "campaign:archive": "Archive campaigns",
  "settings:read": "View settings",
  "settings:update": "Edit workspace settings",
  "users:manage": "Manage members",
  "roles:manage": "Manage roles",
  "billing:manage": "Manage billing",
};

export function getPermissionGroups(): PermissionGroup[] {
  const groups = new Map<string, { key: string; label: string }[]>();

  for (const key of PERMISSION_KEYS) {
    const [module] = key.split(":");
    const label = PERMISSION_LABELS[key] ?? key;
    const entries = groups.get(module) ?? [];
    entries.push({ key, label });
    groups.set(module, entries);
  }

  return Array.from(groups.entries()).map(([module, permissions]) => ({
    module,
    permissions,
  }));
}

async function toRoleListItem(
  role: RoleRecord,
  workspaceId: string,
): Promise<RoleListItem> {
  const memberCount = await countMembershipsWithRole(workspaceId, role.id, "active");

  return {
    id: role.id,
    name: role.name,
    key: role.key,
    permissions: role.permissions,
    isSystem: role.isSystem,
    memberCount,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

export async function listRolesForWorkspace(
  workspaceId: string,
): Promise<RoleListItem[]> {
  const roles = await findRolesForWorkspace(workspaceId);
  return Promise.all(roles.map((role) => toRoleListItem(role, workspaceId)));
}

export async function createCustomRole(input: {
  workspaceId: string;
  actorId: string;
  data: CreateRoleInput;
}): Promise<RoleListItem> {
  if (isSystemRoleKey(input.data.key)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Cannot create a role with a reserved system key.",
    );
  }

  const role = await createRole({
    workspaceId: input.workspaceId,
    name: input.data.name,
    key: input.data.key,
    permissions: input.data.permissions,
    isSystem: false,
  });

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "role.created",
    entityType: "role",
    entityId: role.id,
    after: {
      name: role.name,
      key: role.key,
      permissions: role.permissions,
    },
  });

  return toRoleListItem(role, input.workspaceId);
}

export async function updateCustomRole(input: {
  workspaceId: string;
  roleId: string;
  actorId: string;
  data: UpdateRoleInput;
}): Promise<RoleListItem> {
  const existing = await findRoleByIdInWorkspace(input.roleId, input.workspaceId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Role not found.");
  }

  if (existing.isSystem) {
    throw new AppError("FORBIDDEN", "System roles are read-only.");
  }

  const updated = await updateRole(input.roleId, input.workspaceId, input.data);

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "role.updated",
    entityType: "role",
    entityId: updated.id,
    before: {
      name: existing.name,
      permissions: existing.permissions,
    },
    after: {
      name: updated.name,
      permissions: updated.permissions,
    },
  });

  return toRoleListItem(updated, input.workspaceId);
}

export async function deleteCustomRole(input: {
  workspaceId: string;
  roleId: string;
  actorId: string;
}): Promise<void> {
  const existing = await findRoleByIdInWorkspace(input.roleId, input.workspaceId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Role not found.");
  }

  if (existing.isSystem) {
    throw new AppError("FORBIDDEN", "System roles cannot be deleted.");
  }

  const memberCount = await countMembershipsWithRole(
    input.workspaceId,
    input.roleId,
    "active",
  );

  if (memberCount > 0) {
    await createAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "role.delete_blocked",
      entityType: "role",
      entityId: input.roleId,
      after: { memberCount },
    });

    throw new AppError(
      "CONFLICT",
      "Role is assigned to active members and cannot be deleted.",
    );
  }

  await deleteRoleById(input.roleId, input.workspaceId);

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "role.deleted",
    entityType: "role",
    entityId: input.roleId,
    before: { name: existing.name, key: existing.key },
  });
}
