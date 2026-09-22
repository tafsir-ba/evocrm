/**
 * Locked V1 primary navigation — permission-aware from Phase 2.
 * Visit Notes lives at top-level `/notes` (not under `/w/[slug]/…`).
 */

import { workspaceNavPath } from "@/lib/workspace-paths";

export const V1_NAV_ITEMS = [
  { segment: "dashboard", label: "Dashboard" },
  { segment: "projects", label: "Projects" },
  { segment: "pipeline", label: "Pipeline" },
  { segment: "leads", label: "Leads" },
  { segment: "properties", label: "Properties" },
  { segment: "activities", label: "Activities" },
  { segment: "notes", label: "Notes" },
  { segment: "dripping", label: "Dripping" },
  { segment: "settings", label: "Settings" },
] as const;

/** Labels that must never appear as primary sidebar navigation (Settings subsections allowed). */
export const FORBIDDEN_PRIMARY_NAV_LABELS = [
  "Contacts",
  "Companies",
  "Reports",
  "Tasks",
  "Documents",
  "Integrations",
  "Client Portal",
  "Opportunities",
  "Calendar",
  "Automations",
  "Marketing",
  "Billing",
  "Users",
  "Roles",
] as const;

export type V1NavSegment = (typeof V1_NAV_ITEMS)[number]["segment"];

export const V1_NAV_PERMISSIONS: Record<V1NavSegment, string> = {
  dashboard: "dashboard:read",
  projects: "project:read",
  pipeline: "opportunity:read",
  leads: "lead:read",
  properties: "property:read",
  activities: "activity:read",
  notes: "activity:read",
  dripping: "campaign:read",
  settings: "settings:read",
};

/** Absolute (non-workspace) hrefs for specific primary nav segments. */
export const V1_NAV_ABSOLUTE_HREFS: Partial<Record<V1NavSegment, string>> = {
  notes: "/notes",
};

/** Non-nav workspace routes that still require a permission check on direct URL access. */
export const EXTENDED_ROUTE_PERMISSIONS: Record<string, string> = {
  opportunities: "opportunity:read",
};

export type WorkspaceNavigationItem = {
  label: string;
  href: string;
  permission: string;
  segment: V1NavSegment;
};

export function navHrefForSegment(
  workspaceSlug: string,
  segment: V1NavSegment,
): string {
  return V1_NAV_ABSOLUTE_HREFS[segment] ?? workspaceNavPath(workspaceSlug, segment);
}

export function buildPermissionAwareNavigation(
  workspaceSlug: string,
  permissions: readonly string[],
): WorkspaceNavigationItem[] {
  return V1_NAV_ITEMS.filter((item) =>
    permissions.includes(V1_NAV_PERMISSIONS[item.segment]),
  ).map((item) => ({
    label: item.label,
    href: navHrefForSegment(workspaceSlug, item.segment),
    permission: V1_NAV_PERMISSIONS[item.segment],
    segment: item.segment,
  }));
}

export function getRequiredPermissionForSegment(
  segment: string,
): string | undefined {
  if (segment in V1_NAV_PERMISSIONS) {
    return V1_NAV_PERMISSIONS[segment as V1NavSegment];
  }

  if (segment in EXTENDED_ROUTE_PERMISSIONS) {
    return EXTENDED_ROUTE_PERMISSIONS[segment];
  }

  return undefined;
}
