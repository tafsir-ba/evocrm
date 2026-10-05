/**
 * Read-only Ad Copilot “What to do next” suggestions.
 * Deterministic from freshness, spend, clicks, and attributed funnel counts.
 * Never mutates Meta, budgets, or consent.
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
  spend: number;
  clicks: number;
  funnel: AdCopilotFunnelCounts;
};

export type AdCopilotNextStep = {
  kind: AdCopilotNextStepKind;
  title: string;
  explanation: string;
  nextAction: string;
  needsSettingsRefresh: boolean;
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

  if (
    input.freshness === "never_synced" ||
    input.freshness === "stale" ||
    input.freshness === "untrusted"
  ) {
    const neverSynced = input.freshness === "never_synced";
    const untrusted = input.freshness === "untrusted";
    return {
      kind: "refresh_data",
      title: neverSynced
        ? "Load the latest ads numbers"
        : "Refresh the ads numbers",
      explanation: neverSynced
        ? "We have not loaded ads numbers yet, so we cannot tell what is working."
        : untrusted
          ? "These numbers are too old to trust. Fresh numbers come first, before any other advice."
          : "These numbers are getting old. Fresh numbers come first, before any other advice.",
      nextAction: "Open Settings → Paid ads and click Refresh now.",
      needsSettingsRefresh: true,
    };
  }

  if ((spend > 0 || clicks > 0) && !hasAttributedFunnel(funnel)) {
    return {
      kind: "check_landing_tracking",
      title: "Check the landing page tracking",
      explanation:
        "Ads are spending money or getting clicks, but no form fills are linked to this project yet.",
      nextAction:
        "Check that the landing page form is sending people into this project’s leads.",
      needsSettingsRefresh: false,
    };
  }

  if (
    funnel.formLeads > 0 &&
    funnel.qualifiedLeads === 0 &&
    funnel.opportunities === 0 &&
    funnel.wins === 0
  ) {
    return {
      kind: "review_lead_quality",
      title: "Review who is filling the form",
      explanation:
        "People filled in a form from ads, but none are marked as good leads yet.",
      nextAction:
        "Review lead quality and whether the ads are reaching the right people.",
      needsSettingsRefresh: false,
    };
  }

  if (funnel.wins > 0) {
    return {
      kind: "focus_wins",
      title: "Ads helped win a sale",
      explanation: "At least one ad-linked sale is marked as won.",
      nextAction:
        "Keep doing more of what is already working. Do not change ads just to change them.",
      needsSettingsRefresh: false,
    };
  }

  if (funnel.opportunities > 0) {
    return {
      kind: "focus_opportunities",
      title: "Sales have started from ads",
      explanation: "Some ad-linked people are now in the sales pipeline.",
      nextAction:
        "Keep those sales moving. Stay focused on what already brought them in.",
      needsSettingsRefresh: false,
    };
  }

  if (funnel.qualifiedLeads > 0) {
    return {
      kind: "focus_qualified_leads",
      title: "Good leads are coming in",
      explanation: "Ads helped bring in good leads. Keep helping those people.",
      nextAction:
        "Follow up the good leads and keep the ads focused on the same kind of people.",
      needsSettingsRefresh: false,
    };
  }

  return {
    kind: "waiting_for_activity",
    title: "Nothing to change yet",
    explanation:
      "There is no recent spend or clicks, and no linked form fills yet.",
    nextAction:
      "If ads should already be running, refresh in Settings → Paid ads. If they just started, wait for numbers.",
    needsSettingsRefresh: true,
  };
}
