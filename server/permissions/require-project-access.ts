import "server-only";

/**
 * Project access helpers. Implementation lives in resolve-workspace-access
 * so grant-only (no WorkspaceMembership) collaborators are supported.
 */
export {
  requireProjectAccess,
  resolveAllowedProjectIds,
  type ProjectAccessContext,
} from "@/server/permissions/resolve-workspace-access";
