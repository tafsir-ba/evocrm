import "server-only";

import {
  PROJECT_ROLE_DISPLAY_DEFINITIONS,
  PROJECT_ROLE_KEYS,
  type ProjectRoleKey,
} from "@/lib/project-sharing-roles";
import type { PermissionKey } from "@/server/permissions/permissions";
import { validatePermissions } from "@/server/permissions/permissions";

export type ProjectRoleDefinition = {
  name: string;
  key: ProjectRoleKey;
  description: string;
  permissions: PermissionKey[];
};

const PROJECT_ADMIN_PERMISSIONS = validatePermissions([
  "dashboard:read",
  "project:read",
  "project:update",
  "lead:create",
  "lead:read",
  "lead:update",
  "lead:archive",
  "property:read",
  "property:update",
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
  "campaign:read",
  "settings:read",
]);

const CONTRIBUTOR_PERMISSIONS = validatePermissions([
  "dashboard:read",
  "project:read",
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
]);

const VIEWER_PERMISSIONS = validatePermissions([
  "dashboard:read",
  "project:read",
  "lead:read",
  "property:read",
  "opportunity:read",
  "activity:read",
  "document:read",
  "campaign:read",
]);

export const PROJECT_ROLE_DEFINITIONS: ProjectRoleDefinition[] = [
  {
    ...PROJECT_ROLE_DISPLAY_DEFINITIONS[0]!,
    permissions: PROJECT_ADMIN_PERMISSIONS,
  },
  {
    ...PROJECT_ROLE_DISPLAY_DEFINITIONS[1]!,
    permissions: CONTRIBUTOR_PERMISSIONS,
  },
  {
    ...PROJECT_ROLE_DISPLAY_DEFINITIONS[2]!,
    permissions: VIEWER_PERMISSIONS,
  },
];

export function getProjectRoleDefinition(key: ProjectRoleKey): ProjectRoleDefinition {
  const role = PROJECT_ROLE_DEFINITIONS.find((r) => r.key === key);
  if (!role) {
    throw new Error(`Unknown project role key: ${key}`);
  }
  return role;
}

export function getProjectRolePermissions(key: ProjectRoleKey): PermissionKey[] {
  return getProjectRoleDefinition(key).permissions;
}

export function isProjectRoleKey(key: string): key is ProjectRoleKey {
  return (PROJECT_ROLE_KEYS as readonly string[]).includes(key);
}

/**
 * Effective permissions = intersection of workspace permissions and project-role permissions.
 * A project role can narrow but never expand what the workspace ceiling allows.
 */
export function resolveEffectiveProjectPermissions(
  workspacePermissions: readonly string[],
  projectRoleKey: ProjectRoleKey,
): PermissionKey[] {
  const projectPermissions = getProjectRolePermissions(projectRoleKey);
  return projectPermissions.filter((p) => workspacePermissions.includes(p));
}
