/**
 * Campaign email analytics — metric formulas, health thresholds, and availability.
 *
 * Unique-email KPIs use CampaignSend first-touch timestamps (one row per send).
 * Total open/click event counts may come from EmailEvent when displayed separately.
 */

/** Analytics fidelity starts when Resend event → CampaignSend enrichment shipped. */
export const CAMPAIGN_ANALYTICS_AVAILABLE_FROM = new Date("2026-07-30T00:00:00.000Z");

export const CAMPAIGN_ANALYTICS_THRESHOLDS = {
  /** Below this many sent emails, health is "insufficient_data". */
  minSampleSize: 20,
  /** Bounce rate ≥ this → Needs attention (of sent). */
  bounceNeedsAttention: 0.02,
  /** Bounce rate ≥ this → Critical. */
  bounceCritical: 0.05,
  /** Complaint rate ≥ this → Needs attention (of delivered). */
  complaintNeedsAttention: 0.0005,
  /** Complaint rate ≥ this → Critical. */
  complaintCritical: 0.001,
  /** Delivery rate below this → Needs attention. */
  deliveryNeedsAttention: 0.95,
  /** Delivery rate below this → Critical. */
  deliveryCritical: 0.9,
} as const;

export type CampaignAnalyticsPeriodPreset = "7d" | "30d" | "90d" | "all";

export type CampaignHealthStatus =
  | "healthy"
  | "needs_attention"
  | "critical"
  | "insufficient_data";

export type CampaignHealthResult = {
  status: CampaignHealthStatus;
  label: string;
  reasons: string[];
};

export function ratePercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
}

export function evaluateCampaignDeliveryHealth(input: {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  failed: number;
}): CampaignHealthResult {
  if (input.sent < CAMPAIGN_ANALYTICS_THRESHOLDS.minSampleSize) {
    return {
      status: "insufficient_data",
      label: "Insufficient data",
      reasons: [
        `Fewer than ${CAMPAIGN_ANALYTICS_THRESHOLDS.minSampleSize} emails were sent in this period, so performance may not be representative.`,
      ],
    };
  }

  const deliveryRate = input.sent > 0 ? input.delivered / input.sent : 0;
  const bounceRate = input.sent > 0 ? input.bounced / input.sent : 0;
  const complaintRate = input.delivered > 0 ? input.complained / input.delivered : 0;
  const reasons: string[] = [];
  let status: CampaignHealthStatus = "healthy";

  if (bounceRate >= CAMPAIGN_ANALYTICS_THRESHOLDS.bounceCritical) {
    status = "critical";
    reasons.push(
      `Bounce rate is ${(bounceRate * 100).toFixed(1)}% of sent emails (critical threshold ${(CAMPAIGN_ANALYTICS_THRESHOLDS.bounceCritical * 100).toFixed(0)}%).`,
    );
  } else if (bounceRate >= CAMPAIGN_ANALYTICS_THRESHOLDS.bounceNeedsAttention) {
    status = "needs_attention";
    reasons.push(
      `Bounce rate is ${(bounceRate * 100).toFixed(1)}% of sent emails.`,
    );
  }

  if (complaintRate >= CAMPAIGN_ANALYTICS_THRESHOLDS.complaintCritical) {
    status = "critical";
    reasons.push(
      `Spam complaint rate is ${(complaintRate * 100).toFixed(2)}% of delivered emails.`,
    );
  } else if (complaintRate >= CAMPAIGN_ANALYTICS_THRESHOLDS.complaintNeedsAttention) {
    if (status === "healthy") {
      status = "needs_attention";
    }
    reasons.push(
      `Spam complaints were recorded (${input.complained} of ${input.delivered} delivered).`,
    );
  }

  if (deliveryRate < CAMPAIGN_ANALYTICS_THRESHOLDS.deliveryCritical) {
    status = "critical";
    reasons.push(
      `Delivery rate is ${(deliveryRate * 100).toFixed(1)}% (critical below ${(CAMPAIGN_ANALYTICS_THRESHOLDS.deliveryCritical * 100).toFixed(0)}%).`,
    );
  } else if (deliveryRate < CAMPAIGN_ANALYTICS_THRESHOLDS.deliveryNeedsAttention) {
    if (status === "healthy") {
      status = "needs_attention";
    }
    reasons.push(
      `Delivery rate is ${(deliveryRate * 100).toFixed(1)}% of sent emails.`,
    );
  }

  if (input.failed > 0 && status === "healthy") {
    status = "needs_attention";
    reasons.push(`${input.failed} provider send failure${input.failed === 1 ? "" : "s"} recorded.`);
  } else if (input.failed > 0 && status !== "critical") {
    reasons.push(`${input.failed} provider send failure${input.failed === 1 ? "" : "s"} recorded.`);
  }

  if (status === "healthy") {
    reasons.push(
      `${ratePercent(input.delivered, input.sent)}% of sent emails were delivered${
        input.complained === 0 ? ", with no complaints recorded" : ""
      }.`,
    );
  }

  const label =
    status === "healthy"
      ? "Healthy"
      : status === "needs_attention"
        ? "Needs attention"
        : status === "critical"
          ? "Critical"
          : "Insufficient data";

  return { status, label, reasons };
}

export function resolveAnalyticsPeriodDays(
  preset: CampaignAnalyticsPeriodPreset,
): number | null {
  if (preset === "7d") return 7;
  if (preset === "30d") return 30;
  if (preset === "90d") return 90;
  return null;
}
