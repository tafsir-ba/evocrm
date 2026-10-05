/**
 * Paid-ads attribution QA / synthetic lead exclusion (reporting layer).
 *
 * Excludes test smoke leads from form / qualified / opportunity / won outcomes
 * and derived cost metrics. Does not rely on person name alone.
 */

import { readLeadIntegrationAttributes } from "@/lib/lead-integration-attributes";

export const PAID_ADS_ATTRIBUTION_POLICY_KEY = "paidAdsAttribution";

export type PaidAdsQaExclusionReason =
  | "explicit_attribute"
  | "reserved_email_domain"
  | "zero_phone"
  | "qa_utm_campaign"
  | "qa_utm_content"
  | "qa_notes";

export type PaidAdsQaLeadSignals = {
  email?: string | null;
  emailNormalized?: string | null;
  phone?: string | null;
  phoneNormalized?: string | null;
  notes?: string | null;
  attributes?: Record<string, unknown> | null;
  /** Optional UTM override (e.g. from touchpoint when lead attributes missing). */
  utm?: {
    campaign?: string | null;
    content?: string | null;
    source?: string | null;
    medium?: string | null;
    term?: string | null;
  } | null;
};

/** RFC 2606 / clearly non-customer hosts used in smoke scripts. */
export const PAID_ADS_QA_RESERVED_EMAIL_DOMAINS = [
  "example.com",
  "example.org",
  "example.net",
  "invalid",
  "localhost",
  "test",
] as const;

const QA_UTM_MARKER = /(?:^|_)(?:qa|smoke)(?:_|$)|ad_copilot_qa/i;
const QA_CONTENT_MARKER = /(?:^|_)(?:qa|smoke)(?:_|$)|^live_smoke$/i;
const QA_NOTES_MARKER = /\bqa\s+seulement\b|\bqa\s+only\b/i;

export type PaidAdsAttributionPolicy = {
  excludeFromOutcomes: true;
};

export function readPaidAdsAttributionPolicy(
  attributes: Record<string, unknown> | null | undefined,
): PaidAdsAttributionPolicy | null {
  if (!attributes || typeof attributes !== "object") {
    return null;
  }
  const raw = attributes[PAID_ADS_ATTRIBUTION_POLICY_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const policy = raw as Record<string, unknown>;
  if (policy.excludeFromOutcomes !== true) {
    return null;
  }
  return { excludeFromOutcomes: true };
}

export function buildPaidAdsAttributionExcludePolicy(): Record<string, unknown> {
  return {
    [PAID_ADS_ATTRIBUTION_POLICY_KEY]: {
      excludeFromOutcomes: true as const,
    },
  };
}

function emailDomain(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") {
    return null;
  }
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 0 || at === trimmed.length - 1) {
    return null;
  }
  return trimmed.slice(at + 1);
}

function phoneDigits(phone: string | null | undefined): string {
  if (!phone || typeof phone !== "string") {
    return "";
  }
  return phone.replace(/\D/g, "");
}

function isAllZeroPhone(phone: string | null | undefined): boolean {
  const digits = phoneDigits(phone);
  return digits.length >= 6 && /^0+$/.test(digits);
}

function resolveUtm(input: PaidAdsQaLeadSignals) {
  const fromAttributes = readLeadIntegrationAttributes(input.attributes ?? null)?.utm;
  return {
    campaign: input.utm?.campaign ?? fromAttributes?.campaign ?? null,
    content: input.utm?.content ?? fromAttributes?.content ?? null,
  };
}

export function evaluatePaidAdsQaExclusion(
  input: PaidAdsQaLeadSignals,
): { excluded: boolean; reasons: PaidAdsQaExclusionReason[] } {
  const reasons: PaidAdsQaExclusionReason[] = [];

  if (readPaidAdsAttributionPolicy(input.attributes)) {
    reasons.push("explicit_attribute");
  }

  const domain =
    emailDomain(input.emailNormalized) ?? emailDomain(input.email);
  if (
    domain &&
    (PAID_ADS_QA_RESERVED_EMAIL_DOMAINS as readonly string[]).includes(domain)
  ) {
    reasons.push("reserved_email_domain");
  }

  if (
    isAllZeroPhone(input.phoneNormalized) ||
    isAllZeroPhone(input.phone)
  ) {
    reasons.push("zero_phone");
  }

  const utm = resolveUtm(input);
  if (utm.campaign && QA_UTM_MARKER.test(utm.campaign)) {
    reasons.push("qa_utm_campaign");
  }
  if (utm.content && QA_CONTENT_MARKER.test(utm.content.trim())) {
    reasons.push("qa_utm_content");
  }

  if (input.notes && QA_NOTES_MARKER.test(input.notes)) {
    reasons.push("qa_notes");
  }

  return {
    excluded: reasons.length > 0,
    reasons,
  };
}

export function isPaidAdsQaExcludedLead(input: PaidAdsQaLeadSignals): boolean {
  return evaluatePaidAdsQaExclusion(input).excluded;
}

/** Kids-friendly helper for Paid ads Business results. */
export function paidAdsQaExclusionNotice(excludedCount: number): string | null {
  if (!Number.isFinite(excludedCount) || excludedCount <= 0) {
    return null;
  }
  const n = Math.floor(excludedCount);
  return n === 1
    ? "We hid 1 test form fill so it does not change your results."
    : `We hid ${n} test form fills so they do not change your results.`;
}
