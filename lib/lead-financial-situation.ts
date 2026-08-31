import { isHttpsUrl } from "@/lib/lead-enrichment";

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
  "other",
] as const;

export type FinancialSituationSource = (typeof FINANCIAL_SITUATION_SOURCES)[number];

export const FINANCIAL_SITUATION_SOURCE_LABELS: Record<FinancialSituationSource, string> = {
  declared_by_lead: "Declared by lead",
  advisor: "Advisor / agent",
  document: "Supporting document",
  other: "Other",
};

export const FINANCIAL_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type FinancialConfidenceLevel = (typeof FINANCIAL_CONFIDENCE_LEVELS)[number];

export const MARKET_INCOME_DISCLAIMER =
  "Occupational estimate only: typical pay for this role and market (for example a CTO at a company like Neho in Switzerland). Not this person’s income, bank data, or a credit/mortgage decision.";

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

export function hasOccupationalEstimateInputs(lead: {
  jobTitle?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  country?: string | null;
}): boolean {
  const jobTitle = lead.jobTitle?.trim();
  const location = [lead.city, lead.stateRegion, lead.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
  return Boolean(jobTitle && location);
}

export function shouldRequestMarketEstimateAfterEnrichment(input: {
  uniqueReveal: boolean;
  jobTitle?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  country?: string | null;
}): boolean {
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
