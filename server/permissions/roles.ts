import "server-only";

import type { PermissionKey } from "./permissions";
import { validatePermissions } from "./permissions";

export const SYSTEM_ROLE_KEYS = ["owner", "admin", "agent", "viewer"] as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export type DefaultRoleDefinition = {
  name: string;
  key: SystemRoleKey;
  permissions: PermissionKey[];
  isSystem: true;
};

const OWNER_PERMISSIONS = validatePermissions([
  "dashboard:read",
  "lead:create",
  "lead:read",
  "lead:update",
  "lead:archive",
  "property:create",
  "property:read",
  "property:update",
  "property:archive",
  "opportunity:create",
  "opportunity:read",
  "opportunity:update",
  "opportunity:archive",
  "activity:create",
  "activity:read",
  "activity:update",
  "activity:archive",
  "document:create",
  "document:read",
  "document:archive",
  "campaign:create",
  "campaign:read",
  "campaign:update",
  "campaign:archive",
  "campaign:delete",
  "settings:read",
  "settings:update",
  "users:manage",
  "roles:manage",
  "billing:manage",
]);

const ADMIN_PERMISSIONS = validatePermissions([
  "dashboard:read",
  "lead:create",
  "lead:read",
  "lead:update",
  "lead:archive",
  "property:create",
  "property:read",
  "property:update",
  "property:archive",
  "opportunity:create",
  "opportunity:read",
  "opportunity:update",
  "opportunity:archive",
  "activity:create",
  "activity:read",
  "activity:update",
  "activity:archive",
  "document:create",
  "document:read",
  "document:archive",
  "campaign:create",
  "campaign:read",
  "campaign:update",
  "campaign:archive",
  "campaign:delete",
  "settings:read",
  "settings:update",
  "users:manage",
  "roles:manage",
  "billing:manage",
]);

const AGENT_PERMISSIONS = validatePermissions([
  "dashboard:read",
  "lead:create",
  "lead:read",
  "lead:update",
  "property:read",
  "opportunity:create",
  "opportunity:read",
  "opportunity:update",
  "activity:create",
  "activity:read",
  "activity:update",
  "document:create",
  "document:read",
  "campaign:read",
  "settings:read",
]);

const VIEWER_PERMISSIONS = validatePermissions([
  "dashboard:read",
  "lead:read",
  "property:read",
  "opportunity:read",
  "activity:read",
  "document:read",
  "campaign:read",
  "settings:read",
]);

export const DEFAULT_ROLE_DEFINITIONS: DefaultRoleDefinition[] = [
  { name: "Owner", key: "owner", permissions: OWNER_PERMISSIONS, isSystem: true },
  { name: "Admin", key: "admin", permissions: ADMIN_PERMISSIONS, isSystem: true },
  { name: "Agent", key: "agent", permissions: AGENT_PERMISSIONS, isSystem: true },
  { name: "Viewer", key: "viewer", permissions: VIEWER_PERMISSIONS, isSystem: true },
];

export function getDefaultRolePermissions(key: SystemRoleKey): PermissionKey[] {
  const role = DEFAULT_ROLE_DEFINITIONS.find((definition) => definition.key === key);

  if (!role) {
    throw new Error(`Unknown system role key: ${key}`);
  }

  return role.permissions;
}

export function isSystemRoleKey(key: string): key is SystemRoleKey {
  return (SYSTEM_ROLE_KEYS as readonly string[]).includes(key);
}
