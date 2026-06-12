import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { DEFAULT_ROLE_DEFINITIONS } from "@/server/permissions/roles";
import { createRole, type RoleRecord } from "@/server/repositories/roles";

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
  const { findRoleByWorkspaceAndKey } = await import("@/server/repositories/roles");
  return findRoleByWorkspaceAndKey(workspaceId, "owner");
}
