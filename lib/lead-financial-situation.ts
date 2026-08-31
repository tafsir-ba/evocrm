import { inferOccupationalRole, isHttpsUrl } from "@/lib/lead-enrichment";

export const FINANCIAL_EMPLOYMENT_TYPES = [
  "employed",
  "self_employed",
  "company_director",
  "retired",
  "other",
] as const;

export type FinancialEmploymentType = (typeof FINANCIAL_EMPLOYMENT_TYPES)[number];

export const FINANCIAL_EMPLOYMENT_TYPE_LABELS: Record<FinancialEmploymentType, string> = {
  employed: "Employed",
  self_employed: "Self-employed",
  company_director: "Company director",
  retired: "Retired",
  other: "Other",
};

export const FINANCIAL_SITUATION_SOURCES = [
  "declared_by_lead",
  "advisor",
  "document",
  "occupational_estimate",
  "other",
] as const;

export type FinancialSituationSource = (typeof FINANCIAL_SITUATION_SOURCES)[number];

export const FINANCIAL_SITUATION_SOURCE_LABELS: Record<FinancialSituationSource, string> = {
  declared_by_lead: "Declared by lead",
  advisor: "Advisor / agent",
  document: "Supporting document",
  occupational_estimate: "Occupational estimate",
  other: "Other",
};

export const HUMAN_FINANCIAL_SITUATION_SOURCES = [
  "declared_by_lead",
  "advisor",
  "document",
] as const;

export type HumanFinancialSituationSource = (typeof HUMAN_FINANCIAL_SITUATION_SOURCES)[number];

/** Rough discussion budget so a broker can see if a pitch is worth the time. Not a loan amount. */
export const OCCUPATIONAL_DISCUSSION_BUDGET_MULTIPLE = 6;

export const FINANCIAL_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type FinancialConfidenceLevel = (typeof FINANCIAL_CONFIDENCE_LEVELS)[number];

export const MARKET_INCOME_DISCLAIMER =
  "Occupational working figure: typical pay for this role and market (for example a CTO at a company like Neho in Switzerland). For a broker to gauge affordability and whether to pitch. Not this person’s declared income, bank data, or a credit/mortgage decision. Replace if the lead gives real numbers.";

export type LeadFinancialSituationSnapshot = {
  declaredAnnualIncome: number | null;
  employmentType: FinancialEmploymentType | null;
  availableDepositEquity: number | null;
  targetPurchasePrice: number | null;
  financingNeed: number | null;
  existingCommitments: string | null;
  affordabilityNotes: string | null;
  currency: string;
  source: FinancialSituationSource | null;
  asOfDate: string | null;
  confidence: FinancialConfidenceLevel | null;
  assessorNotes: string | null;
};

export type MarketIncomeEstimate = {
  rangeMin: number | null;
  rangeMax: number | null;
  currency: string;
  methodology: string;
  sources: Array<{ url: string; title: string }>;
  confidencePercent: number;
  jobTitleUsed: string;
  locationUsed: string;
  retrievedAt: string;
  aiModel: string;
  searchProvider: string;
  demoMode?: boolean;
  reviewed: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  disclaimer: string;
};

export function extractOccupationalWageNumbers(text: string): number[] {
  const compact = text.replace(/[’']/g, "").replace(/,/g, " ");
  const out: number[] = [];
  for (const match of compact.matchAll(/(\d+(?:\.\d+)?)\s*[kK]\b/g)) {
    const value = Math.round(Number(match[1]) * 1000);
    if (value >= 10_000 && value <= 10_000_000) {
      out.push(value);
    }
  }
  for (const match of compact.matchAll(/\b(\d{2,3}(?:\s\d{3}){1,2}|\d{5,7})\b/g)) {
    const value = Number(match[1]!.replace(/\s/g, ""));
    if (value >= 10_000 && value <= 10_000_000) {
      out.push(value);
    }
  }
  return out;
}

export function parseOccupationalWageRange(
  hits: Array<{ url: string; title: string; snippet: string }>,
): { rangeMin: number; rangeMax: number; sources: Array<{ url: string; title: string }> } | null {
  const numbers: number[] = [];
  const sources: Array<{ url: string; title: string }> = [];
  for (const hit of hits) {
    if (!isHttpsUrl(hit.url)) {
      continue;
    }
    const found = extractOccupationalWageNumbers(`${hit.title} ${hit.snippet}`);
    if (found.length === 0) {
      continue;
    }
    numbers.push(...found);
    sources.push({ url: hit.url, title: hit.title });
  }
  if (numbers.length < 2 || sources.length === 0) {
    return null;
  }
  numbers.sort((a, b) => a - b);
  return {
    rangeMin: numbers[0]!,
    rangeMax: numbers[numbers.length - 1]!,
    sources,
  };
}

export function parseOccupationalEstimatePayload(parsed: unknown): {
  rangeMin: number;
  rangeMax: number;
  methodology: string;
  confidencePercent: number;
} | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const row = parsed as Record<string, unknown>;
  const rangeMin = Number(row.rangeMin);
  const rangeMax = Number(row.rangeMax);
  if (!Number.isFinite(rangeMin) || !Number.isFinite(rangeMax)) {
    return null;
  }
  if (rangeMin < 10_000 || rangeMax > 10_000_000 || rangeMax < rangeMin) {
    return null;
  }
  const confidence = Math.min(55, Math.max(20, Math.round(Number(row.confidencePercent) || 35)));
  const methodology =
    typeof row.methodology === "string" && row.methodology.trim()
      ? row.methodology.trim()
      : "Occupational market estimate for this role and location. Not this person’s income.";
  return {
    rangeMin: Math.round(rangeMin),
    rangeMax: Math.round(rangeMax),
    methodology,
    confidencePercent: confidence,
  };
}

export type OccupationalEstimateLead = {
  jobTitle?: string | null;
  industry?: string | null;
  companyName?: string | null;
  professionalProfileUrl?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  country?: string | null;
};

export function resolveOccupationalJobTitle(
  lead: OccupationalEstimateLead,
): { jobTitle: string; inferred: boolean } | null {
  const existing = lead.jobTitle?.trim();
  if (existing) {
    return { jobTitle: existing, inferred: false };
  }
  const inferred = inferOccupationalRole({
    industry: lead.industry,
    companyName: lead.companyName,
    professionalProfileUrl: lead.professionalProfileUrl,
  });
  if (!inferred?.jobTitle) {
    return null;
  }
  return { jobTitle: inferred.jobTitle, inferred: true };
}

export function occupationalEstimateLocation(lead: OccupationalEstimateLead): string {
  return [lead.city, lead.stateRegion, lead.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

export function hasOccupationalEstimateInputs(lead: OccupationalEstimateLead): boolean {
  return Boolean(resolveOccupationalJobTitle(lead) && occupationalEstimateLocation(lead));
}

export function shouldRequestMarketEstimateAfterEnrichment(
  input: OccupationalEstimateLead & { uniqueReveal: boolean },
): boolean {
  return input.uniqueReveal && hasOccupationalEstimateInputs(input);
}

export function emptyFinancialSnapshot(currency: string): LeadFinancialSituationSnapshot {
  return {
    declaredAnnualIncome: null,
    employmentType: null,
    availableDepositEquity: null,
    targetPurchasePrice: null,
    financingNeed: null,
    existingCommitments: null,
    affordabilityNotes: null,
    currency,
    source: null,
    asOfDate: null,
    confidence: null,
    assessorNotes: null,
  };
}

export function isHumanEnteredFinancialSource(
  source: FinancialSituationSource | null | undefined,
): boolean {
  return (
    source === "declared_by_lead" || source === "advisor" || source === "document"
  );
}

export function inferEmploymentTypeFromJobTitle(jobTitle: string): FinancialEmploymentType {
  const title = jobTitle.toLowerCase();
  if (/\b(retired|retrait[ée]|pensioner)\b/.test(title)) {
    return "retired";
  }
  const ownerLike =
    /\b(owner|founder|co-?founder|proprietor|self[- ]employed|freelance(?:r)?|independent|sole trader)\b/.test(
      title,
    );
  const directorLike =
    /\b(company director|managing director|geschäftsführer|g[ée]rant|ceo|chief executive|president|pr[ée]sident)\b/.test(
      title,
    );
  if (ownerLike) {
    return directorLike ? "company_director" : "self_employed";
  }
  if (directorLike || /\bdirector\b/.test(title)) {
    return "company_director";
  }
  return "employed";
}

export function occupationalEstimateMidpoint(
  estimate: Pick<MarketIncomeEstimate, "rangeMin" | "rangeMax">,
): number | null {
  const min = estimate.rangeMin;
  const max = estimate.rangeMax;
  const values = [min, max].filter((value): value is number => value != null && Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }
  const raw = values.length === 2 ? (values[0]! + values[1]!) / 2 : values[0]!;
  return Math.round(raw / 1000) * 1000;
}

export function confidenceFromOccupationalPercent(
  confidencePercent: number,
): FinancialConfidenceLevel {
  return confidencePercent < 40 ? "low" : "medium";
}

function formatWorkingMoney(value: number): string {
  return value.toLocaleString("de-CH");
}

export function workingFiguresFromOccupationalEstimate(
  estimate: MarketIncomeEstimate,
): Partial<LeadFinancialSituationSnapshot> | null {
  const midpoint = occupationalEstimateMidpoint(estimate);
  if (midpoint == null) {
    return null;
  }
  const rangeMin = estimate.rangeMin;
  const rangeMax = estimate.rangeMax;
  const rangeLabel =
    rangeMin != null && rangeMax != null
      ? `${formatWorkingMoney(rangeMin)}–${formatWorkingMoney(rangeMax)} ${estimate.currency}`
      : `${formatWorkingMoney(midpoint)} ${estimate.currency}`;
  const discussionBudget = midpoint * OCCUPATIONAL_DISCUSSION_BUDGET_MULTIPLE;
  const asOfDate = estimate.retrievedAt.slice(0, 10);
  return {
    declaredAnnualIncome: midpoint,
    employmentType: inferEmploymentTypeFromJobTitle(estimate.jobTitleUsed),
    targetPurchasePrice: discussionBudget,
    affordabilityNotes: `Working figure for pitch. Typical ${estimate.jobTitleUsed} pay in ${estimate.locationUsed}: ${rangeLabel} (midpoint ${formatWorkingMoney(midpoint)} used as annual income). Discussion budget is about ${OCCUPATIONAL_DISCUSSION_BUDGET_MULTIPLE}× that midpoint (${formatWorkingMoney(discussionBudget)} ${estimate.currency}). Replace these fields if the lead declares real numbers.`,
    currency: estimate.currency,
    source: "occupational_estimate",
    asOfDate: /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ? asOfDate : null,
    confidence: confidenceFromOccupationalPercent(estimate.confidencePercent),
  };
}

export function applyOccupationalEstimateToSnapshot(input: {
  snapshot: LeadFinancialSituationSnapshot;
  estimate: MarketIncomeEstimate;
}): { snapshot: LeadFinancialSituationSnapshot; applied: boolean } {
  if (isHumanEnteredFinancialSource(input.snapshot.source)) {
    return { snapshot: input.snapshot, applied: false };
  }
  const working = workingFiguresFromOccupationalEstimate(input.estimate);
  if (!working) {
    return { snapshot: input.snapshot, applied: false };
  }
  return {
    applied: true,
    snapshot: {
      ...input.snapshot,
      ...working,
      availableDepositEquity: input.snapshot.availableDepositEquity,
      financingNeed: input.snapshot.financingNeed,
      existingCommitments: input.snapshot.existingCommitments,
      assessorNotes: input.snapshot.assessorNotes,
    },
  };
}
