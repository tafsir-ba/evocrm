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
    description: "Full project management including inviting collaborators",
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
