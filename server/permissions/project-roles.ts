import "server-only";

import type { PermissionKey } from "@/server/permissions/permissions";
import { validatePermissions } from "@/server/permissions/permissions";

export const PROJECT_ROLE_KEYS = ["project_admin", "contributor", "viewer"] as const;

export type ProjectRoleKey = (typeof PROJECT_ROLE_KEYS)[number];

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
    name: "Project Admin",
    key: "project_admin",
    description: "Full project management including inviting collaborators",
    permissions: PROJECT_ADMIN_PERMISSIONS,
  },
  {
    name: "Contributor",
    key: "contributor",
    description: "Create and edit leads, opportunities, and activities",
    permissions: CONTRIBUTOR_PERMISSIONS,
  },
  {
    name: "Viewer",
    key: "viewer",
    description: "Read-only access to project data",
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
