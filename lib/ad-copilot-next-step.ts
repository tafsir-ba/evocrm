/**
 * Read-only Ad Copilot Action Center recommendations.
 * Deterministic from freshness, spend, clicks, and attributed funnel counts.
 * Never mutates Meta, budgets, or consent. Recommendation-only.
 */

export type AdCopilotFreshness =
  | "fresh"
  | "stale"
  | "untrusted"
  | "never_synced";

export const AD_COPILOT_NEXT_STEP_KINDS = [
  "refresh_data",
  "check_landing_tracking",
  "review_lead_quality",
  "focus_qualified_leads",
  "focus_opportunities",
  "focus_wins",
  "waiting_for_activity",
] as const;

export type AdCopilotNextStepKind = (typeof AD_COPILOT_NEXT_STEP_KINDS)[number];

export type AdCopilotFunnelCounts = {
  formLeads: number;
  qualifiedLeads: number;
  opportunities: number;
  wins: number;
};

export type AdCopilotNextStepInput = {
  freshness: AdCopilotFreshness;
  /** Plain freshness label from the overview (e.g. “Updated recently”). */
  freshnessLabel: string;
  spend: number;
  clicks: number;
  funnel: AdCopilotFunnelCounts;
};

export type AdCopilotNextStep = {
  kind: AdCopilotNextStepKind;
  title: string;
  /** What the current numbers show, in plain language. */
  whatNumbersSay: string;
  /** Why that matters for the business, in plain language. */
  whyItMatters: string;
  /** Safe manual next step — never auto-executed. */
  manualNextStep: string;
  /** Evidence / freshness label shown on the Action Center card. */
  evidenceLabel: string;
  needsSettingsRefresh: boolean;
  /**
   * @deprecated Prefer whyItMatters — kept for overview payload compatibility.
   */
  explanation: string;
  /**
   * @deprecated Prefer manualNextStep — kept for overview payload compatibility.
   */
  nextAction: string;
};

export function emptyAdCopilotFunnel(): AdCopilotFunnelCounts {
  return {
    formLeads: 0,
    qualifiedLeads: 0,
    opportunities: 0,
    wins: 0,
  };
}

export function countAttributedFunnelOutcomes(
  milestones: readonly string[],
): AdCopilotFunnelCounts {
  const funnel = emptyAdCopilotFunnel();
  for (const milestone of milestones) {
    if (milestone === "form_lead") {
      funnel.formLeads += 1;
    } else if (milestone === "qualified_lead") {
      funnel.qualifiedLeads += 1;
    } else if (milestone === "opportunity_created") {
      funnel.opportunities += 1;
    } else if (milestone === "won") {
      funnel.wins += 1;
    }
  }
  return funnel;
}

function hasAttributedFunnel(funnel: AdCopilotFunnelCounts): boolean {
  return (
    funnel.formLeads > 0 ||
    funnel.qualifiedLeads > 0 ||
    funnel.opportunities > 0 ||
    funnel.wins > 0
  );
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function recommendation(parts: {
  kind: AdCopilotNextStepKind;
  title: string;
  whatNumbersSay: string;
  whyItMatters: string;
  manualNextStep: string;
  evidenceLabel: string;
  needsSettingsRefresh: boolean;
}): AdCopilotNextStep {
  return {
    ...parts,
    explanation: parts.whyItMatters,
    nextAction: parts.manualNextStep,
  };
}

function formatCount(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function buildAdCopilotNextStep(
  input: AdCopilotNextStepInput,
): AdCopilotNextStep {
  const spend = positive(input.spend);
  const clicks = positive(input.clicks);
  const funnel = {
    formLeads: positive(input.funnel.formLeads),
    qualifiedLeads: positive(input.funnel.qualifiedLeads),
    opportunities: positive(input.funnel.opportunities),
    wins: positive(input.funnel.wins),
  };
  const evidenceLabel =
    input.freshnessLabel.trim() || "Freshness not available";

  if (
    input.freshness === "never_synced" ||
    input.freshness === "stale" ||
    input.freshness === "untrusted"
  ) {
    const neverSynced = input.freshness === "never_synced";
    const untrusted = input.freshness === "untrusted";
    return recommendation({
      kind: "refresh_data",
      title: neverSynced
        ? "Load the latest ads numbers"
        : "Refresh the ads numbers",
      whatNumbersSay: neverSynced
        ? "We have not loaded ads numbers for this project yet."
        : untrusted
          ? "These ads numbers are too old to trust."
          : "These ads numbers are getting old.",
      whyItMatters:
        "Fresh numbers come first. Advice from old numbers can point you the wrong way.",
      manualNextStep: "Open Settings → Paid ads and click Refresh now.",
      evidenceLabel,
      needsSettingsRefresh: true,
    });
  }

  if ((spend > 0 || clicks > 0) && !hasAttributedFunnel(funnel)) {
    const spendPart =
      spend > 0 ? `about ${Math.round(spend)} in recent ad spend` : null;
    const clickPart =
      clicks > 0
        ? formatCount(clicks, "recent click", "recent clicks")
        : null;
    const activity = [spendPart, clickPart].filter(Boolean).join(" and ");
    return recommendation({
      kind: "check_landing_tracking",
      title: "Check the landing page tracking",
      whatNumbersSay: `Ads show ${activity}, but no form fills are linked to this project yet.`,
      whyItMatters:
        "If people click ads but never show up as leads here, the landing page may not be sending them into this project.",
      manualNextStep:
        "Check that the landing page form is sending people into this project’s leads.",
      evidenceLabel,
      needsSettingsRefresh: false,
    });
  }

  if (
    funnel.formLeads > 0 &&
    funnel.qualifiedLeads === 0 &&
    funnel.opportunities === 0 &&
    funnel.wins === 0
  ) {
    return recommendation({
      kind: "review_lead_quality",
      title: "Review who is filling the form",
      whatNumbersSay: `${formatCount(funnel.formLeads, "person filled", "people filled")} in a form from ads, but none are marked as good leads yet.`,
      whyItMatters:
        "Form fills alone do not mean the ads are reaching the right people. Good-lead status is the next business step.",
      manualNextStep:
        "Review lead quality and whether the ads are reaching the right people.",
      evidenceLabel,
      needsSettingsRefresh: false,
    });
  }

  if (funnel.wins > 0) {
    return recommendation({
      kind: "focus_wins",
      title: "Ads helped win a sale",
      whatNumbersSay: `${formatCount(funnel.wins, "ad-linked sale is", "ad-linked sales are")} marked as won.`,
      whyItMatters:
        "Won sales are the top business result. When ads already help win, keep the path that worked.",
      manualNextStep:
        "Keep doing more of what is already working. Do not change ads just to change them.",
      evidenceLabel,
      needsSettingsRefresh: false,
    });
  }

  if (funnel.opportunities > 0) {
    return recommendation({
      kind: "focus_opportunities",
      title: "Sales have started from ads",
      whatNumbersSay: `${formatCount(funnel.opportunities, "ad-linked person is", "ad-linked people are")} in the sales pipeline, but none are marked as won yet.`,
      whyItMatters:
        "Pipeline progress matters more than more form fills. Help these people finish the sale before changing the ads.",
      manualNextStep:
        "Keep those sales moving. Stay focused on what already brought them in.",
      evidenceLabel,
      needsSettingsRefresh: false,
    });
  }

  if (funnel.qualifiedLeads > 0) {
    return recommendation({
      kind: "focus_qualified_leads",
      title: "Good leads are waiting for a sales step",
      whatNumbersSay: `${formatCount(funnel.qualifiedLeads, "good lead is", "good leads are")} linked to ads, but none have become sales opportunities yet.`,
      whyItMatters:
        "Good leads are the step before pipeline. Following them up usually matters more than changing the ads.",
      manualNextStep:
        "Follow up the good leads and keep the ads focused on the same kind of people.",
      evidenceLabel,
      needsSettingsRefresh: false,
    });
  }

  return recommendation({
    kind: "waiting_for_activity",
    title: "Nothing to change yet",
    whatNumbersSay:
      "There is no recent spend or clicks, and no linked form fills yet.",
    whyItMatters:
      "Without activity, there is not enough evidence to recommend a change.",
    manualNextStep:
      "If ads should already be running, refresh in Settings → Paid ads. If they just started, wait for numbers.",
    evidenceLabel,
    needsSettingsRefresh: true,
  });
}
