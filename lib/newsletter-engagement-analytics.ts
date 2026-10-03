/**
 * Newsletter engagement analytics helpers.
 *
 * Delivery rate uses unique delivered ÷ unique sent (provider-accepted sends),
 * matching campaign analytics. “Who did not open” is among delivered recipients
 * (deliveredAt set, firstOpenedAt null) — not among all sent/pending.
 */

import { ratePercent } from "@/lib/campaign-analytics";

export type NewsletterDeliveryCounts = {
  queued: number;
  stillQueued: number;
  sent: number;
  delivered: number;
  failed: number;
  bounced: number;
  skipped: number;
};

export type NewsletterDeliveryRateSummary = NewsletterDeliveryCounts & {
  /** delivered / sent × 100 (null when sent === 0). */
  deliveryRate: number | null;
  /** Provider-accepted attempts = sent (status sent). */
  attempted: number;
};

export function buildNewsletterDeliveryRateSummary(
  counts: NewsletterDeliveryCounts,
): NewsletterDeliveryRateSummary {
  return {
    ...counts,
    attempted: counts.sent,
    deliveryRate: ratePercent(counts.delivered, counts.sent),
  };
}

export type EngagementPartition = "opened" | "not_opened";

export type EngagementSendRow = {
  id: string;
  status: string;
  deliveredAt: Date | string | null;
  firstOpenedAt: Date | string | null;
};

/**
 * Returns true when a send row belongs in the engagement list for the partition.
 * - opened: unique openers (firstOpenedAt set)
 * - not_opened: delivered with no open event
 */
export function matchesEngagementPartition(
  row: EngagementSendRow,
  partition: EngagementPartition,
): boolean {
  if (row.status !== "sent") {
    return false;
  }

  if (partition === "opened") {
    return row.firstOpenedAt != null;
  }

  return row.deliveredAt != null && row.firstOpenedAt == null;
}

export type NewsletterIssueType =
  | "bounced"
  | "failed"
  | "complained"
  | "delayed"
  | "skipped";

export type IssueClassificationInput = {
  status: "queued" | "sent" | "failed" | "skipped";
  bouncedAt?: Date | string | null;
  providerFailedAt?: Date | string | null;
  complainedAt?: Date | string | null;
  deliveryDelayedAt?: Date | string | null;
  error?: string | null;
  providerError?: string | null;
  sentAt?: Date | string | null;
  createdAt?: Date | string | null;
  scheduledFor?: Date | string | null;
};

export type IssueClassification = {
  issueType: NewsletterIssueType;
  reason: string | null;
  eventAt: Date | string;
} | null;

/**
 * Classify a CampaignSend row into a delivery/issue bucket for analytics.
 * Priority for sent rows: complained > bounced > provider failed > delayed.
 * Status failed/skipped use app-level error text.
 */
export function classifyNewsletterIssue(
  row: IssueClassificationInput,
): IssueClassification {
  if (row.status === "skipped") {
    return {
      issueType: "skipped",
      reason: row.error ?? "Skipped",
      eventAt: row.scheduledFor ?? row.createdAt ?? new Date(0).toISOString(),
    };
  }

  if (row.status === "failed") {
    return {
      issueType: "failed",
      reason: row.error ?? "Send failed",
      eventAt: row.scheduledFor ?? row.createdAt ?? new Date(0).toISOString(),
    };
  }

  if (row.status !== "sent") {
    return null;
  }

  if (row.complainedAt) {
    return {
      issueType: "complained",
      reason: "Spam complaint",
      eventAt: row.complainedAt,
    };
  }

  if (row.bouncedAt) {
    return {
      issueType: "bounced",
      reason: row.providerError ?? null,
      eventAt: row.bouncedAt,
    };
  }

  if (row.providerFailedAt) {
    return {
      issueType: "failed",
      reason: row.providerError ?? row.error ?? null,
      eventAt: row.providerFailedAt,
    };
  }

  if (row.deliveryDelayedAt) {
    return {
      issueType: "delayed",
      reason: row.providerError ?? null,
      eventAt: row.deliveryDelayedAt,
    };
  }

  return null;
}

export const NEWSLETTER_ISSUE_TYPE_LABELS: Record<NewsletterIssueType, string> = {
  bounced: "Bounced",
  failed: "Failed",
  complained: "Complaint",
  delayed: "Delayed",
  skipped: "Skipped",
};

export const NEWSLETTER_DELIVERY_RATE_FORMULA =
  "unique delivered / unique sent × 100 (sent = accepted by the email provider)";

export const NEWSLETTER_NOT_OPENED_BASIS =
  "Delivered recipients with no unique open event (firstOpenedAt empty). Pending/sent-without-delivery are excluded.";
