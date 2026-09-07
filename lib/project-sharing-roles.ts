export const PROJECT_ROLE_KEYS = ["project_admin", "contributor", "viewer"] as const;

export type ProjectRoleKey = (typeof PROJECT_ROLE_KEYS)[number];

export type ProjectRoleDisplayDefinition = {
  name: string;
  key: ProjectRoleKey;
  description: string;
};

export const PROJECT_ROLE_DISPLAY_DEFINITIONS: ProjectRoleDisplayDefinition[] = [
  {
    name: "Project Admin",
    key: "project_admin",
    description: "Manage roles and access; full project management",
  },
  {
    name: "Contributor",
    key: "contributor",
    description: "Create and edit leads, opportunities, and activities",
  },
  {
    name: "Viewer",
    key: "viewer",
    description: "Read-only access to project data",
  },
];

const PROJECT_ROLE_RANK: Record<ProjectRoleKey, number> = {
  viewer: 0,
  contributor: 1,
  project_admin: 2,
};

export function projectRoleRank(role: ProjectRoleKey): number {
  return PROJECT_ROLE_RANK[role];
}

export function canAssignProjectRole(
  actorRole: ProjectRoleKey,
  targetRole: ProjectRoleKey,
): boolean {
  return projectRoleRank(actorRole) >= projectRoleRank(targetRole);
}
