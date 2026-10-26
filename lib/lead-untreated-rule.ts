/**
 * CRM-wide "Untreated" lead rule.
 *
 * A lead is moved from New to Untreated only when every treatment signal is
 * older than the threshold. Signals (most recent wins):
 * - lead.createdAt (CRM capture / migrated source create date)
 * - attributes.integration.receivedAt (latest inbound submission)
 * - lead.lastContactedAt
 * - latest Activity on the lead (any type/status, incl. HubSpot-synced notes)
 * - latest Notes (visit) session linked to the lead
 * - latest human treatment audit on the lead (status change, assignment,
 *   edit incl. Lead.notes, tags, restore, financial situation)
 *
 * lead.updatedAt is intentionally NOT a signal: background writers
 * (enrichment, HubSpot sync, backfills) bump it without any sales treatment.
 */

export const LEAD_UNTREATED_THRESHOLD_DAYS = 30;

export const LEAD_NEW_STATUS_KEY = "new";
export const LEAD_UNTREATED_STATUS_KEY = "untreated";
export const LEAD_UNTREATED_STATUS_LABEL = "Untreated";

export const LEAD_UNTREATED_AUTOMATION_SOURCE = "lead_untreated_rule";

export const LEAD_TREATMENT_AUDIT_ACTIONS = [
  "lead.status_changed",
  "lead.assigned",
  "lead.updated",
  "lead.tags_updated",
  "lead.restored",
  "lead.financial_situation_updated",
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type LeadTreatmentSignals = {
  createdAt: Date;
  inboundReceivedAt?: Date | null;
  lastContactedAt?: Date | null;
  lastActivityAt?: Date | null;
  lastVisitSessionAt?: Date | null;
  lastTreatmentAuditAt?: Date | null;
};

export type LeadUntreatedEvaluation =
  | { eligible: true; lastTreatmentAt: Date; idleDays: number }
  | {
      eligible: false;
      reason: "not_new" | "archived" | "recent_treatment";
      lastTreatmentAt: Date | null;
    };

export function leadUntreatedCutoff(
  now: Date,
  thresholdDays: number = LEAD_UNTREATED_THRESHOLD_DAYS,
): Date {
  return new Date(now.getTime() - thresholdDays * DAY_MS);
}

function validDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseInboundReceivedAt(
  attributes: Record<string, unknown> | null | undefined,
): Date | null {
  const integration = attributes?.integration;
  if (!integration || typeof integration !== "object" || Array.isArray(integration)) {
    return null;
  }
  const raw = (integration as Record<string, unknown>).receivedAt;
  return typeof raw === "string" || raw instanceof Date ? validDate(raw) : null;
}

export function latestLeadTreatmentAt(signals: LeadTreatmentSignals): Date {
  let latest = signals.createdAt;
  for (const value of [
    signals.inboundReceivedAt,
    signals.lastContactedAt,
    signals.lastActivityAt,
    signals.lastVisitSessionAt,
    signals.lastTreatmentAuditAt,
  ]) {
    const date = validDate(value);
    if (date && date.getTime() > latest.getTime()) {
      latest = date;
    }
  }
  return latest;
}

export function evaluateLeadUntreated(input: {
  statusId: string;
  newStatusId: string;
  archivedAt?: Date | null;
  signals: LeadTreatmentSignals;
  now: Date;
  thresholdDays?: number;
}): LeadUntreatedEvaluation {
  if (input.archivedAt) {
    return { eligible: false, reason: "archived", lastTreatmentAt: null };
  }
  if (input.statusId !== input.newStatusId) {
    return { eligible: false, reason: "not_new", lastTreatmentAt: null };
  }

  const lastTreatmentAt = latestLeadTreatmentAt(input.signals);
  const cutoff = leadUntreatedCutoff(input.now, input.thresholdDays);

  if (lastTreatmentAt.getTime() > cutoff.getTime()) {
    return { eligible: false, reason: "recent_treatment", lastTreatmentAt };
  }

  return {
    eligible: true,
    lastTreatmentAt,
    idleDays: Math.floor((input.now.getTime() - lastTreatmentAt.getTime()) / DAY_MS),
  };
}
