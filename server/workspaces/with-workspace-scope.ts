import "server-only";

/**
 * Merge a server-resolved workspaceId into a repository filter.
 * Never accept workspaceId from client request bodies — pass only
 * the value from resolveWorkspace() / requireMembership() chain.
 */
export function withWorkspaceScope<T extends Record<string, unknown>>(
  workspaceId: string,
  filter: T,
): T & { workspaceId: string } {
  return {
    ...filter,
    workspaceId,
  };
}
