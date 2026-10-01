import "server-only";

/**
 * Advertising approval vocabulary (Phase 0 foundation).
 * Used by proposals, ActionCommands, and UI approval queues in later phases.
 */

export const ADVERTISING_APPROVAL_STATES = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "cancelled",
  "expired",
] as const;

export type AdvertisingApprovalState = (typeof ADVERTISING_APPROVAL_STATES)[number];

export const ADVERTISING_APPROVAL_SUBJECTS = [
  "connection_change",
  "campaign_launch",
  "audience_change",
  "creative_claim",
  "budget_increase",
  "budget_decrease",
  "pause",
  "resume",
  "publish",
  "conversion_export",
  "customer_match_export",
] as const;

export type AdvertisingApprovalSubject = (typeof ADVERTISING_APPROVAL_SUBJECTS)[number];

/** Subjects that always require a human approver before any ActionCommand executes. */
export const ADVERTISING_HUMAN_APPROVAL_REQUIRED: readonly AdvertisingApprovalSubject[] = [
  "connection_change",
  "campaign_launch",
  "audience_change",
  "creative_claim",
  "budget_increase",
  "publish",
  "conversion_export",
  "customer_match_export",
] as const;

/** Subjects that may later run under Phase 4 guardrails without a fresh approval. */
export const ADVERTISING_GUARDRAIL_AUTOMATABLE: readonly AdvertisingApprovalSubject[] = [
  "budget_decrease",
  "pause",
] as const;

export function requiresHumanApproval(subject: AdvertisingApprovalSubject): boolean {
  return (ADVERTISING_HUMAN_APPROVAL_REQUIRED as readonly string[]).includes(subject);
}
