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
  "Market-income estimates are occupational ranges for human review only. They must never be used to make or recommend an automated credit, mortgage, pricing, housing, or eligibility decision.";

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

export function parseOccupationalWageRange(
  hits: Array<{ url: string; title: string; snippet: string }>,
): { rangeMin: number; rangeMax: number; sources: Array<{ url: string; title: string }> } | null {
  const numbers: number[] = [];
  const sources: Array<{ url: string; title: string }> = [];
  for (const hit of hits) {
    if (!isHttpsUrl(hit.url)) {
      continue;
    }
    const found = `${hit.title} ${hit.snippet}`
      .replace(/,/g, "")
      .match(/\d{4,7}/g)
      ?.map(Number)
      .filter((value) => value >= 10_000 && value <= 10_000_000);
    if (!found || found.length === 0) {
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
