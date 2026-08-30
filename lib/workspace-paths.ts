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

export function workspaceHref(
  workspaceSlug: string,
  segments: string | string[],
  query?: Record<string, string | number | null | undefined>,
): string {
  const path = workspacePath(
    workspaceSlug,
    ...(Array.isArray(segments) ? segments : [segments]),
  );
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined && String(value).length > 0) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
