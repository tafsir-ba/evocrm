import type { LeadFieldProvenance, LeadFieldProvenanceMethod } from "@/lib/lead-intelligence";

export const WEB_ENRICHMENT_SOURCE = "manual_web_enrichment";
export const WEB_ENRICHMENT_METHOD = "enrichment" as const;
export const WEB_ENRICHMENT_ATTRIBUTES_KEY = "webEnrichment";

export const LEAD_ENRICHMENT_ALLOWED_SOURCES = [
  "professional_directory",
  "company_website",
  "news_press",
  "professional_registry",
] as const;

export type LeadEnrichmentAllowedSource =
  (typeof LEAD_ENRICHMENT_ALLOWED_SOURCES)[number];

export const LEAD_ENRICHMENT_ALLOWED_SOURCE_LABELS: Record<
  LeadEnrichmentAllowedSource,
  string
> = {
  professional_directory: "Public professional directories (e.g. LinkedIn public pages)",
  company_website: "Company / employer websites",
  news_press: "News and press releases",
  professional_registry: "Professional registries and filings",
};

export const LEAD_ENRICHMENT_FIELD_KEYS = [
  "companyName",
  "jobTitle",
  "industry",
  "city",
  "stateRegion",
  "country",
  "preferredContactClues",
  "professionalProfileUrl",
  "otherProfessional",
] as const;

export type LeadEnrichmentFieldKey = (typeof LEAD_ENRICHMENT_FIELD_KEYS)[number];

export const LEAD_ENRICHMENT_FIELD_LABELS: Record<LeadEnrichmentFieldKey, string> = {
  companyName: "Company",
  jobTitle: "Job title",
  industry: "Industry",
  city: "City",
  stateRegion: "Region / canton",
  country: "Country",
  preferredContactClues: "Preferred contact clues",
  professionalProfileUrl: "Professional profile / website",
  otherProfessional: "Other public professional information",
};

export const LEAD_ENRICHMENT_RUN_STATUSES = [
  "searching",
  "reviewing",
  "ambiguous",
  "failed",
  "accepted",
  "expired",
  "revoked",
] as const;

export type LeadEnrichmentRunStatus = (typeof LEAD_ENRICHMENT_RUN_STATUSES)[number];

export const LEAD_ENRICHMENT_SUGGESTION_STATUSES = [
  "proposed",
  "accepted",
  "rejected",
  "edited",
  "reverted",
  "revoked",
] as const;

export type LeadEnrichmentSuggestionStatus =
  (typeof LEAD_ENRICHMENT_SUGGESTION_STATUSES)[number];

export const LEAD_ENRICHMENT_IDENTITY_MATCHES = ["unique", "ambiguous", "none"] as const;
export type LeadEnrichmentIdentityMatch =
  (typeof LEAD_ENRICHMENT_IDENTITY_MATCHES)[number];

export const CRM_ENTERED_PROVENANCE_METHODS: readonly LeadFieldProvenanceMethod[] = [
  "manual",
  "import",
  "website",
  "api",
];

export const DEFAULT_ENRICHMENT_RETENTION_DAYS = 180;
export const HIGH_CONFIDENCE_THRESHOLD = 70;
export const UNSOURCED_CONFIDENCE_CAP = 40;

export const WEB_ENRICHMENT_SIDE_EFFECT_GUARD = {
  triggerAutomation: false as const,
};

const EXCLUDED_CONTENT_PATTERNS = [
  /\bssn\b/i,
  /\bsocial security\b/i,
  /\bpassport\b/i,
  /\bnational id\b/i,
  /\bhealth\b/i,
  /\bdiagnos/i,
  /\bmedical\b/i,
  /\bhome address\b/i,
  /\bresidential address\b/i,
  /\bminor\b/i,
  /\bunderage\b/i,
  /\bpassword\b/i,
  /\bcredential\b/i,
  /\ballegation\b/i,
  /\barrest\b/i,
  /\bcredit score\b/i,
  /\bbank account\b/i,
  /\biban\b/i,
  /\bsalary\b/i,
  /\bincome\b/i,
  /\bmortgage\b/i,
  /\breligion\b/i,
  /\bsexual\b/i,
  /\bracial\b/i,
  /\bethnic\b/i,
];

export type LeadEnrichmentSearchHit = {
  url: string;
  title: string;
  snippet: string;
  retrievedAt: string;
};

export type LeadEnrichmentSuggestion = {
  id: string;
  fieldKey: LeadEnrichmentFieldKey;
  proposedValue: string;
  currentValue: string | null;
  currentOrigin: LeadFieldProvenanceMethod | "unknown" | null;
  confidencePercent: number;
  rationale: string;
  sourceUrls: string[];
  retrievedAt: string;
  searchProvider: string;
  aiModel: string;
  status: LeadEnrichmentSuggestionStatus;
  acceptedValue: string | null;
  previousValue: string | null;
  previousProvenance: LeadFieldProvenance | null;
  overwriteAcknowledged: boolean;
  decidedBy: string | null;
  decidedAt: string | null;
};

export type LeadEnrichmentSummary = {
  text: string;
  citationUrls: string[];
  status: "draft" | "accepted" | "rejected";
  acceptedAt: string | null;
  acceptedBy: string | null;
};

export function isLeadEnrichmentFieldKey(value: string): value is LeadEnrichmentFieldKey {
  return (LEAD_ENRICHMENT_FIELD_KEYS as readonly string[]).includes(value);
}

export function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Citations must come from retrieved search hits, not model-invented URLs. */
export function citeOnlyRetrievedUrls(
  urls: string[],
  retrievedUrls: Iterable<string>,
): string[] {
  const allowed = new Set(
    [...retrievedUrls].filter((url) => isHttpsUrl(url)),
  );
  return [...new Set(urls.filter((url) => allowed.has(url)))];
}

export function crmValueRequiresOverwrite(
  currentValue: string | null | undefined,
  currentOrigin: LeadFieldProvenanceMethod | "unknown" | null | undefined,
): boolean {
  if (!currentValue?.trim()) {
    return false;
  }
  if (!currentOrigin || currentOrigin === "unknown") {
    return true;
  }
  return (CRM_ENTERED_PROVENANCE_METHODS as readonly string[]).includes(currentOrigin);
}

/** Empty or previously enriched fields may be filled without an overwrite checkbox. */
export function isSafeToAutoApplySuggestion(input: {
  currentValue: string | null | undefined;
  currentOrigin: LeadFieldProvenanceMethod | "unknown" | null | undefined;
}): boolean {
  return !crmValueRequiresOverwrite(input.currentValue, input.currentOrigin);
}

export function contentLooksExcluded(text: string): boolean {
  return EXCLUDED_CONTENT_PATTERNS.some((pattern) => pattern.test(text));
}

export function clampConfidence(input: {
  confidencePercent: number;
  sourceUrls: string[];
}): { confidencePercent: number; dropped: boolean } {
  const urls = input.sourceUrls.filter(isHttpsUrl);
  let confidence = Math.max(0, Math.min(100, Math.round(input.confidencePercent)));
  if (urls.length === 0) {
    if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
      return { confidencePercent: 0, dropped: true };
    }
    confidence = Math.min(confidence, UNSOURCED_CONFIDENCE_CAP);
  }
  return { confidencePercent: confidence, dropped: false };
}

export function sanitizeEnrichmentText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || contentLooksExcluded(trimmed)) {
    return null;
  }
  return trimmed.slice(0, 500);
}

export function originLabel(
  method: LeadFieldProvenanceMethod | "unknown" | null | undefined,
): string {
  if (method === "enrichment") {
    return "Enriched";
  }
  if (method === "manual") {
    return "CRM";
  }
  if (method === "import") {
    return "Imported";
  }
  if (method === "hubspot") {
    return "HubSpot";
  }
  if (method === "website") {
    return "Website";
  }
  if (method === "api") {
    return "API";
  }
  return "Unknown";
}

export function isUniqueEnrichmentReveal(run: {
  status: string;
  identityMatch?: string | null;
}): boolean {
  return (
    run.identityMatch === "unique" &&
    run.status !== "ambiguous" &&
    run.status !== "failed"
  );
}

export type WebEnrichmentAttributes = {
  preferredContactClues?: string | null;
  otherProfessional?: string | null;
  city?: string | null;
  country?: string | null;
  professionalProfileUrl?: string | null;
  summary?: LeadEnrichmentSummary | null;
  lastRunId?: string | null;
};

export function readWebEnrichmentAttributes(
  attributes: Record<string, unknown> | null | undefined,
): WebEnrichmentAttributes {
  if (!attributes || typeof attributes !== "object") {
    return {};
  }
  const raw = attributes[WEB_ENRICHMENT_ATTRIBUTES_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const bag = raw as Record<string, unknown>;
  return {
    preferredContactClues:
      typeof bag.preferredContactClues === "string" ? bag.preferredContactClues : null,
    otherProfessional: typeof bag.otherProfessional === "string" ? bag.otherProfessional : null,
    city: typeof bag.city === "string" ? bag.city : null,
    country: typeof bag.country === "string" ? bag.country : null,
    professionalProfileUrl:
      typeof bag.professionalProfileUrl === "string" ? bag.professionalProfileUrl : null,
    lastRunId: typeof bag.lastRunId === "string" ? bag.lastRunId : null,
    summary:
      bag.summary && typeof bag.summary === "object" && !Array.isArray(bag.summary)
        ? (bag.summary as LeadEnrichmentSummary)
        : null,
  };
}

export function mergeWebEnrichmentAttributes(
  attributes: Record<string, unknown> | null | undefined,
  patch: Partial<WebEnrichmentAttributes>,
): Record<string, unknown> {
  const current = { ...(attributes ?? {}) };
  const existing = readWebEnrichmentAttributes(current);
  current[WEB_ENRICHMENT_ATTRIBUTES_KEY] = {
    ...existing,
    ...patch,
  };
  return current;
}
