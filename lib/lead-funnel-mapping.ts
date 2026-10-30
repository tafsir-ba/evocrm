/**
 * Central lead-status → funnel-bucket mapping.
 *
 * Workspaces own their `lead_status` dictionary items. This module assigns each
 * item to an active stage, a won outcome, an exit reason, or "other" using
 * stable keys and common label aliases — never hard-coded Mongo ids.
 *
 * Product notes (2026-03):
 * - Seeded CRM statuses include New, Contacted, Qualified, Lost (and
 *   called_no_answer). Visit / Not interested / Unresponsive / Won appear only
 *   when a workspace has added matching lead_status items.
 * - Opportunity "Won" / "Visit" are NOT lead statuses; they are ignored here
 *   unless mirrored as lead_status keys/labels.
 */

export const LEAD_FUNNEL_ACTIVE_STAGES = [
  "new",
  "contacted",
  "visit",
  "qualified",
] as const;

export const LEAD_FUNNEL_EXIT_REASONS = [
  "not_interested",
  "unresponsive",
  "lost",
] as const;

export type LeadFunnelActiveStage = (typeof LEAD_FUNNEL_ACTIVE_STAGES)[number];
export type LeadFunnelExitReason = (typeof LEAD_FUNNEL_EXIT_REASONS)[number];
export type LeadFunnelBucket =
  | LeadFunnelActiveStage
  | "won"
  | LeadFunnelExitReason
  | "other";

export type LeadFunnelStatusRef = {
  id: string;
  key: string;
  label: string;
  color?: string | null;
  order?: number;
};

/** Normalized token for key/label matching. */
export function normalizeFunnelToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const KEY_ALIASES: Record<string, LeadFunnelBucket> = {
  new: "new",
  untreated: "other",
  contacted: "contacted",
  called_no_answer: "contacted",
  call_back_required: "contacted",
  callback: "contacted",
  visit: "visit",
  visited: "visit",
  site_visit: "visit",
  viewing: "visit",
  qualified: "qualified",
  won: "won",
  closed_won: "won",
  lost: "lost",
  closed_lost: "lost",
  not_interested: "not_interested",
  notinterested: "not_interested",
  unresponsive: "unresponsive",
  no_response: "unresponsive",
  unreachable: "unresponsive",
};

const LABEL_ALIASES: Record<string, LeadFunnelBucket> = {
  new: "new",
  contacted: "contacted",
  visit: "visit",
  visited: "visit",
  viewing: "visit",
  qualified: "qualified",
  won: "won",
  lost: "lost",
  not_interested: "not_interested",
  unresponsive: "unresponsive",
  untreated: "other",
};

export function resolveLeadFunnelBucket(
  status: Pick<LeadFunnelStatusRef, "key" | "label">,
): LeadFunnelBucket {
  const keyToken = normalizeFunnelToken(status.key);
  if (keyToken && KEY_ALIASES[keyToken]) {
    return KEY_ALIASES[keyToken];
  }

  const labelToken = normalizeFunnelToken(status.label);
  if (labelToken && LABEL_ALIASES[labelToken]) {
    return LABEL_ALIASES[labelToken];
  }

  // Soft label contains checks for workspace-custom wording.
  if (labelToken.includes("not_interest")) return "not_interested";
  if (labelToken.includes("unresponsive") || labelToken.includes("no_answer")) {
    // called_no_answer already handled via key; generic "no answer" exits stay exit.
    if (!labelToken.includes("call")) return "unresponsive";
  }
  if (labelToken === "visit" || labelToken.endsWith("_visit")) return "visit";
  if (labelToken === "won" || labelToken.endsWith("_won")) return "won";

  return "other";
}

export type MappedFunnelStatus = LeadFunnelStatusRef & {
  bucket: LeadFunnelBucket;
};

export function mapLeadStatusesToFunnel(
  statuses: LeadFunnelStatusRef[],
): MappedFunnelStatus[] {
  return statuses.map((status) => ({
    ...status,
    bucket: resolveLeadFunnelBucket(status),
  }));
}

export function statusIdsForBucket(
  mapped: MappedFunnelStatus[],
  bucket: LeadFunnelBucket,
): string[] {
  return mapped.filter((item) => item.bucket === bucket).map((item) => item.id);
}

export function labelForFunnelBucket(bucket: LeadFunnelBucket): string {
  switch (bucket) {
    case "new":
      return "New";
    case "contacted":
      return "Contacted";
    case "visit":
      return "Visit";
    case "qualified":
      return "Qualified";
    case "won":
      return "Won";
    case "not_interested":
      return "Not interested";
    case "unresponsive":
      return "Unresponsive";
    case "lost":
      return "Lost";
    case "other":
      return "Other";
  }
}

/** Active stages that exist in this workspace's dictionary (preserve funnel order). */
export function presentActiveStages(
  mapped: MappedFunnelStatus[],
): LeadFunnelActiveStage[] {
  return LEAD_FUNNEL_ACTIVE_STAGES.filter((stage) =>
    mapped.some((item) => item.bucket === stage),
  );
}

export function presentExitReasons(
  mapped: MappedFunnelStatus[],
): LeadFunnelExitReason[] {
  return LEAD_FUNNEL_EXIT_REASONS.filter((reason) =>
    mapped.some((item) => item.bucket === reason),
  );
}

export function workspaceHasWonOutcome(mapped: MappedFunnelStatus[]): boolean {
  return mapped.some((item) => item.bucket === "won");
}
