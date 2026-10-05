/**
 * Locked V1 primary navigation — permission-aware from Phase 2.
 * Visit Notes lives at top-level `/notes` (not under `/w/[slug]/…`).
 * Growth Copilot “Paid ads” is a feature-flagged primary entry (product-approved)
 * that opens the existing Settings → Paid ads hub.
 */

import { workspaceNavPath, workspacePath } from "@/lib/workspace-paths";

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

/** Feature-flagged primary nav (not part of the locked V1 core list). */
export const FEATURE_NAV_ITEMS = [
  {
    segment: "advertising",
    label: "Paid ads",
    permission: "advertising:read",
  },
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

export type V1CoreNavSegment = (typeof V1_NAV_ITEMS)[number]["segment"];
export type V1FeatureNavSegment = (typeof FEATURE_NAV_ITEMS)[number]["segment"];
export type V1NavSegment = V1CoreNavSegment | V1FeatureNavSegment;

export const V1_NAV_PERMISSIONS: Record<V1CoreNavSegment, string> = {
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

/** Absolute (non-workspace) or deep-link hrefs for specific primary nav segments. */
export const V1_NAV_ABSOLUTE_HREFS: Partial<Record<V1NavSegment, string>> = {
  notes: "/notes",
};

export type BuildNavigationOptions = {
  /** When true and user has advertising:read, include primary “Paid ads”. */
  advertisingEnabled?: boolean;
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
  if (segment === "advertising") {
    return workspacePath(workspaceSlug, "settings", "advertising");
  }
  return V1_NAV_ABSOLUTE_HREFS[segment] ?? workspaceNavPath(workspaceSlug, segment);
}

/**
 * Whether a primary nav item should show as active for the current pathname.
 * Prefer the longest matching href so Settings does not stay active on Paid ads hub.
 */
export function isPrimaryNavItemActive(
  pathname: string | null | undefined,
  item: Pick<WorkspaceNavigationItem, "href">,
  navigation: readonly Pick<WorkspaceNavigationItem, "href">[],
): boolean {
  if (!pathname) return false;

  const matches = navigation.filter(
    (nav) =>
      pathname === nav.href || pathname.startsWith(`${nav.href}/`),
  );

  if (matches.length === 0) return false;

  const bestHref = matches.reduce((best, nav) =>
    nav.href.length > best.href.length ? nav : best,
  ).href;

  return item.href === bestHref;
}

export function buildPermissionAwareNavigation(
  workspaceSlug: string,
  permissions: readonly string[],
  options: BuildNavigationOptions = {},
): WorkspaceNavigationItem[] {
  const items: WorkspaceNavigationItem[] = V1_NAV_ITEMS.filter((item) =>
    permissions.includes(V1_NAV_PERMISSIONS[item.segment]),
  ).map((item) => ({
    label: item.label,
    href: navHrefForSegment(workspaceSlug, item.segment),
    permission: V1_NAV_PERMISSIONS[item.segment],
    segment: item.segment,
  }));

  if (
    options.advertisingEnabled &&
    permissions.includes("advertising:read")
  ) {
    const paidAds: WorkspaceNavigationItem = {
      segment: "advertising",
      label: "Paid ads",
      href: navHrefForSegment(workspaceSlug, "advertising"),
      permission: "advertising:read",
    };
    const settingsIdx = items.findIndex((item) => item.segment === "settings");
    if (settingsIdx >= 0) {
      items.splice(settingsIdx, 0, paidAds);
    } else {
      items.push(paidAds);
    }
  }

  return items;
}

export function getRequiredPermissionForSegment(
  segment: string,
): string | undefined {
  if (segment in V1_NAV_PERMISSIONS) {
    return V1_NAV_PERMISSIONS[segment as V1CoreNavSegment];
  }

  if (segment === "advertising") {
    return "advertising:read";
  }

  if (segment in EXTENDED_ROUTE_PERMISSIONS) {
    return EXTENDED_ROUTE_PERMISSIONS[segment];
  }

  return undefined;
}
