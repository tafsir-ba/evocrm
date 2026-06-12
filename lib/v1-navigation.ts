/**
 * Locked V1 primary navigation — Phase 1 shell only.
 */

export const V1_NAV_ITEMS = [
  { segment: "dashboard", label: "Dashboard" },
  { segment: "pipeline", label: "Pipeline" },
  { segment: "leads", label: "Leads" },
  { segment: "properties", label: "Properties" },
  { segment: "activities", label: "Activities" },
  { segment: "dripping", label: "Dripping" },
  { segment: "settings", label: "Settings" },
] as const;

export const FORBIDDEN_PRIMARY_NAV_LABELS = [
  "Contacts",
  "Companies",
  "Reports",
  "Tasks",
  "Documents",
  "Integrations",
  "Client Portal",
] as const;

export type V1NavSegment = (typeof V1_NAV_ITEMS)[number]["segment"];
