/**
 * Phase 1 workspace URL helpers.
 * Real workspace resolution arrives in Phase 2.
 */

export const MOCK_WORKSPACE_SLUG = "demo-workspace";

export function workspacePath(
  workspaceSlug: string,
  ...segments: string[]
): string {
  const path = segments.filter(Boolean).join("/");
  return path ? `/w/${workspaceSlug}/${path}` : `/w/${workspaceSlug}`;
}

export function workspaceNavPath(
  workspaceSlug: string,
  segment: string,
): string {
  return workspacePath(workspaceSlug, segment);
}
