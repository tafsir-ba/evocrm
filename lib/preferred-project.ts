import { projectLeadsHref } from "@/lib/workflow-navigation";
import { workspaceNavPath } from "@/lib/workspace-paths";

const STORAGE_PREFIX = "evocrm:preferred-project:";

export function preferredProjectStorageKey(workspaceSlug: string): string {
  return `${STORAGE_PREFIX}${workspaceSlug}`;
}

export function readPreferredProjectId(
  workspaceSlug: string,
  storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined"
    ? null
    : localStorage,
): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(preferredProjectStorageKey(workspaceSlug));
    return value && /^[a-f\d]{24}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function writePreferredProjectId(
  workspaceSlug: string,
  projectId: string | null,
  storage: Pick<Storage, "setItem" | "removeItem"> | null = typeof localStorage === "undefined"
    ? null
    : localStorage,
): void {
  if (!storage) return;
  try {
    const key = preferredProjectStorageKey(workspaceSlug);
    if (!projectId) {
      storage.removeItem(key);
      return;
    }
    if (!/^[a-f\d]{24}$/i.test(projectId)) return;
    storage.setItem(key, projectId);
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Projects primary-nav landing:
 * - preferred/current project → that project's Leads tab
 * - otherwise → projects list (existing selection behaviour)
 */
export function resolveProjectsNavHref(
  workspaceSlug: string,
  preferredProjectId: string | null | undefined,
): string {
  if (preferredProjectId && /^[a-f\d]{24}$/i.test(preferredProjectId)) {
    return projectLeadsHref(workspaceSlug, preferredProjectId);
  }
  return workspaceNavPath(workspaceSlug, "projects");
}

/** Extract project id from `/w/:slug/projects/:id/...` paths. */
export function readProjectIdFromPathname(
  pathname: string | null | undefined,
): string | null {
  if (!pathname) return null;
  const match = pathname.match(/\/projects\/([a-fA-F0-9]{24})(?:\/|$)/);
  return match?.[1] ?? null;
}
