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
export const SOURCED_CONFIDENCE_CAP = 85;
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

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "example.com",
  "example.org",
]);

export function canonicalizeEnrichmentUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    for (const key of [...parsed.searchParams.keys()]) {
      if (
        /^(utm_|fbclid|gclid|gclsrc|msclkid|mc_|yclid|_ga)/i.test(key) ||
        key.toLowerCase() === "ref" ||
        key.toLowerCase() === "si"
      ) {
        parsed.searchParams.delete(key);
      }
    }
    const path = parsed.pathname.replace(/\/+$/, "") || "";
    const search = parsed.searchParams.toString();
    return `${parsed.origin}${path}${search ? `?${search}` : ""}`;
  } catch {
    return null;
  }
}

/** Turn `yanis_berger96` into `yanis berger` — drop separators and a trailing year. */
export function emailLocalPartToPersonName(localPart: string): string {
  const tokens = localPart
    .replace(/[._+\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((token, index, all) => {
      if (index === all.length - 1) {
        const stripped = token.replace(/\d+$/g, "");
        return stripped.length >= 2 ? stripped : token;
      }
      return token;
    })
    .filter((token) => !/^\d+$/.test(token));
  return tokens.join(" ").trim();
}

/** Name+email first. Work-email domains get a second query; consumer inboxes do not. */
export function enrichmentPersonQueryName(fullName: string, email: string): string {
  const name = fullName.trim();
  const address = email.trim();
  if (!name || name.includes("@") || name.toLowerCase() === address.toLowerCase()) {
    const local = address.split("@")[0] ?? "";
    return emailLocalPartToPersonName(local) || name;
  }
  return name;
}

export type EnrichmentSearchContext = {
  phone?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  country?: string | null;
  defaultCurrency?: string | null;
  /** Broker-useful place from the lead’s project (e.g. Geneva for Cressy). */
  searchPlace?: string | null;
};

export type EnrichmentProjectGeo = {
  city?: string | null;
  country?: string | null;
  location?: {
    countryName?: string | null;
    countryCode?: string | null;
    cantonName?: string | null;
    cantonCode?: string | null;
    municipality?: string | null;
  } | null;
};

export const PEOPLE_DATA_VENDOR_HOSTS = [
  "rocketreach.co",
  "zoominfo.com",
  "apollo.io",
  "lusha.com",
  "signalhire.com",
  "contactout.com",
  "hunter.io",
  "clearbit.com",
  "beenverified.com",
];

const PEOPLE_AGGREGATOR_HOSTS = ["theorg.com", "crunchbase.com", "owler.com"];

const MARKET_LOCATION_ALIASES: Record<string, string> = {
  switzerland: "switzerland",
  suisse: "switzerland",
  schweiz: "switzerland",
  swiss: "switzerland",
  lausanne: "switzerland",
  geneva: "switzerland",
  geneve: "switzerland",
  genève: "switzerland",
  genf: "switzerland",
  confignon: "switzerland",
  cressy: "switzerland",
  zurich: "switzerland",
  zürich: "switzerland",
  bern: "switzerland",
  berne: "switzerland",
  basel: "switzerland",
  lugano: "switzerland",
  montreux: "switzerland",
  brent: "switzerland",
  vaud: "switzerland",
  canada: "canada",
  canadien: "canada",
  canadienne: "canada",
  montreal: "canada",
  montréal: "canada",
  quebec: "canada",
  québec: "canada",
  toronto: "canada",
  france: "france",
  paris: "france",
  "united states": "united states",
  usa: "united states",
  "united kingdom": "united kingdom",
  uk: "united kingdom",
  london: "united kingdom",
};

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function hostMatches(host: string, listed: string[]): boolean {
  return listed.some((item) => host === item || host.endsWith(`.${item}`));
}

export function isPeopleDataVendorUrl(url: string): boolean {
  const host = hostnameOf(url);
  return host ? hostMatches(host, PEOPLE_DATA_VENDOR_HOSTS) : false;
}

export function isPeopleAggregatorUrl(url: string): boolean {
  const host = hostnameOf(url);
  return host ? hostMatches(host, PEOPLE_AGGREGATOR_HOSTS) : false;
}

export function isLinkedInProfileUrl(url: string): boolean {
  const host = hostnameOf(url);
  if (!host || !host.includes("linkedin.")) {
    return false;
  }
  try {
    return /\/in\//i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function isPreferredProfessionalUrl(url: string): boolean {
  if (isPeopleDataVendorUrl(url) || isPeopleAggregatorUrl(url) || isLowQualityEnrichmentUrl(url)) {
    return false;
  }
  return isHttpsUrl(url);
}

function compactPlaceKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

const GENEVA_PLACE_KEYS = new Set(["geneve", "genf", "geneva", "ge"]);

/** Village / CRM label → the metro a broker would type. */
const MUNICIPALITY_SEARCH_PLACE: Record<string, string> = {
  brent: "Montreux",
  confignon: "Geneva",
};

export function isGenevaPlace(value: string | null | undefined): boolean {
  return GENEVA_PLACE_KEYS.has(compactPlaceKey(value));
}

export function enrichmentPlaceFromProject(
  project: EnrichmentProjectGeo | null | undefined,
): {
  city: string | null;
  stateRegion: string | null;
  country: string | null;
  searchPlace: string | null;
} {
  if (!project) {
    return { city: null, stateRegion: null, country: null, searchPlace: null };
  }
  const loc = project.location;
  const municipality = loc?.municipality?.trim() || project.city?.trim() || null;
  const canton = loc?.cantonName?.trim() || null;
  const cantonCode = loc?.cantonCode?.trim().toUpperCase() || null;
  const country =
    loc?.countryName?.trim() ||
    project.country?.trim() ||
    (loc?.countryCode === "CH" ? "Switzerland" : null);
  const geneva =
    cantonCode === "GE" || isGenevaPlace(canton) || isGenevaPlace(municipality);
  if (geneva) {
    return {
      city: "Geneva",
      stateRegion: "Geneva",
      country: country ?? "Switzerland",
      searchPlace: "Geneva",
    };
  }
  const metro = municipality ? MUNICIPALITY_SEARCH_PLACE[compactPlaceKey(municipality)] : null;
  if (metro) {
    return {
      city: metro,
      stateRegion: canton,
      country,
      searchPlace: metro,
    };
  }
  const searchPlace = municipality || canton || country;
  return {
    city: municipality,
    stateRegion: canton,
    country,
    searchPlace,
  };
}

export function looksLikeSwissPhone(phone: string | null | undefined): boolean {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) {
    return false;
  }
  if (digits.startsWith("0041")) {
    return digits.length >= 13;
  }
  if (digits.startsWith("41") && digits.length >= 11) {
    return true;
  }
  // National format: 076 316 24 33 / 021 …
  return digits.length === 10 && /^0[1-9]/.test(digits);
}

export function enrichmentMarketHints(context: EnrichmentSearchContext): string[] {
  const hints: string[] = [];
  const push = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return;
    }
    if (!hints.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      hints.push(trimmed);
    }
  };
  push(context.searchPlace);
  push(context.city);
  push(context.stateRegion);
  push(context.country);
  if (
    isGenevaPlace(context.searchPlace) ||
    isGenevaPlace(context.city) ||
    isGenevaPlace(context.stateRegion)
  ) {
    push("Geneva");
    push("Genève");
    push("Genf");
    push("Switzerland");
    push("Suisse");
  }
  if (looksLikeSwissPhone(context.phone)) {
    push("Switzerland");
    push("Suisse");
  } else if (context.defaultCurrency === "CHF" && !context.country?.trim()) {
    push("Switzerland");
  }
  return hints;
}

const TAVILY_COUNTRY_BY_MARKET: Record<string, string> = {
  switzerland: "switzerland",
  france: "france",
  canada: "canada",
  "united states": "united states",
  "united kingdom": "united kingdom",
};

/** Tavily `country` boost — lowercase English country name from their enum. */
export function tavilyCountryFromMarketHints(hints: string[]): string | null {
  for (const hint of hints) {
    const market = canonicalMarketCountry(hint);
    if (market && TAVILY_COUNTRY_BY_MARKET[market]) {
      return TAVILY_COUNTRY_BY_MARKET[market];
    }
  }
  return null;
}

export function enrichmentPrimaryMarketLabel(context: EnrichmentSearchContext): string | null {
  const place = context.searchPlace?.trim();
  if (place) {
    return place;
  }
  const city = context.city?.trim();
  if (city) {
    return city;
  }
  const country = context.country?.trim();
  if (country) {
    return country;
  }
  if (looksLikeSwissPhone(context.phone) || context.defaultCurrency === "CHF") {
    return "Switzerland";
  }
  return null;
}

export function canonicalMarketCountry(text: string): string | null {
  const hay = text.toLowerCase();
  let matched: string | null = null;
  let matchedLength = 0;
  for (const [alias, country] of Object.entries(MARKET_LOCATION_ALIASES)) {
    if (hay.includes(alias) && alias.length > matchedLength) {
      matched = country;
      matchedLength = alias.length;
    }
  }
  return matched;
}

export function marketsMentionedInText(text: string): string[] {
  const hay = text.toLowerCase();
  const found = new Set<string>();
  for (const [alias, country] of Object.entries(MARKET_LOCATION_ALIASES)) {
    if (hay.includes(alias)) {
      found.add(country);
    }
  }
  return [...found];
}

export function preferHitsInProjectMarket<
  T extends { url: string; title: string; snippet?: string },
>(hits: T[], marketHints: string[]): { hits: T[]; narrowed: boolean } {
  if (hits.length === 0 || marketHints.length === 0) {
    return { hits, narrowed: false };
  }
  const matching = hits.filter((hit) => hitMatchesMarket(hit, marketHints));
  if (matching.length === 0 || matching.length === hits.length) {
    return { hits, narrowed: false };
  }
  return { hits: matching, narrowed: true };
}

export function hitMatchesMarket(
  hit: { url: string; title: string; snippet?: string },
  hints: string[],
): boolean {
  if (hints.length === 0) {
    return true;
  }
  const hay = `${hit.title} ${hit.url} ${hit.snippet ?? ""}`;
  if (hints.some((hint) => hay.toLowerCase().includes(hint.toLowerCase()))) {
    return true;
  }
  const hintCountries = new Set(
    hints.map((hint) => canonicalMarketCountry(hint)).filter((value): value is string => Boolean(value)),
  );
  if (hintCountries.size === 0) {
    return false;
  }
  return marketsMentionedInText(hay).some((country) => hintCountries.has(country));
}

export function enrichmentSearchQueries(
  fullName: string,
  email: string,
  context: EnrichmentSearchContext = {},
): string[] {
  const name = enrichmentPersonQueryName(fullName, email);
  const address = email.trim();
  const place = enrichmentPrimaryMarketLabel(context);
  const queries: string[] = [];
  if (name && !name.includes("@") && place) {
    queries.push(`"${name}" ${place}`);
    queries.push(`"${name}" LinkedIn ${place}`);
  } else if (name && !name.includes("@")) {
    queries.push(`"${name}"`);
  }
  if (name && !name.includes("@")) {
    queries.push(`"${name}" "${address}"`);
  } else {
    queries.push(`"${name}" "${address}"`);
  }
  const domain = address.split("@")[1]?.toLowerCase();
  if (domain && !GENERIC_EMAIL_DOMAINS.has(domain)) {
    queries.push(`"${name}" ${domain}`);
  }
  if (name && !name.includes("@")) {
    queries.push(`"${name}" LinkedIn`);
    if (place) {
      queries.push(`"${name}"`);
    }
  }
  return [...new Set(queries)];
}

export function shouldContinueEnrichmentSearch(
  hits: Array<{ url: string; title: string; snippet: string; retrievedAt: string }>,
  marketHints: string[] = [],
): boolean {
  const preferred = hits.filter((hit) => isPreferredProfessionalUrl(hit.url));
  if (marketHints.length > 0) {
    return !preferred.some((hit) => hitMatchesMarket(hit, marketHints));
  }
  return preferred.length < 2;
}

export function rankEnrichmentHits<
  T extends { url: string; title: string; snippet?: string },
>(hits: T[], marketHints: string[] = []): T[] {
  return [...hits].sort((left, right) => {
    const score = (hit: T) => {
      let value = 0;
      if (isLinkedInProfileUrl(hit.url)) value += 50;
      else if (isPreferredProfessionalUrl(hit.url)) value += 25;
      if (isPeopleAggregatorUrl(hit.url)) value -= 15;
      if (isPeopleDataVendorUrl(hit.url)) value -= 40;
      if (marketHints.length > 0 && hitMatchesMarket(hit, marketHints)) value += 20;
      return value;
    };
    return score(right) - score(left);
  });
}

export function crmOwnedMarketContext(input: {
  phone?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  country?: string | null;
  defaultCurrency?: string | null;
  cityOrigin?: string | null;
  stateRegionOrigin?: string | null;
  countryOrigin?: string | null;
  project?: EnrichmentProjectGeo | null;
}): EnrichmentSearchContext {
  const fromEnrichment = (origin?: string | null) => origin === "enrichment";
  const projectPlace = enrichmentPlaceFromProject(input.project);
  const city = fromEnrichment(input.cityOrigin)
    ? projectPlace.city
    : input.city?.trim() || projectPlace.city;
  const stateRegion = fromEnrichment(input.stateRegionOrigin)
    ? projectPlace.stateRegion
    : input.stateRegion?.trim() || projectPlace.stateRegion;
  const country = fromEnrichment(input.countryOrigin)
    ? projectPlace.country
    : input.country?.trim() || projectPlace.country;
  return {
    phone: input.phone ?? null,
    city,
    stateRegion,
    country,
    defaultCurrency: input.defaultCurrency ?? null,
    searchPlace:
      projectPlace.searchPlace ||
      city ||
      country ||
      (looksLikeSwissPhone(input.phone) || input.defaultCurrency === "CHF"
        ? "Switzerland"
        : null),
  };
}

export function suggestedLocationConflictsWithMarket(
  suggestions: Array<{ fieldKey: string; value: string }>,
  marketHints: string[],
): boolean {
  const marketCountries = new Set(
    marketHints.map((hint) => canonicalMarketCountry(hint)).filter((value): value is string => Boolean(value)),
  );
  if (marketCountries.size === 0) {
    return false;
  }
  const suggested = [suggestions.find((row) => row.fieldKey === "country")?.value, suggestions.find((row) => row.fieldKey === "city")?.value]
    .map((value) => (value ? canonicalMarketCountry(value) : null))
    .filter((value): value is string => Boolean(value));
  if (suggested.length === 0) {
    return false;
  }
  return suggested.every((country) => !marketCountries.has(country));
}

export function personNameTokens(fullName: string): string[] {
  return fullName
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

export function isLowQualityEnrichmentUrl(url: string): boolean {
  if (isPeopleDataVendorUrl(url)) {
    return true;
  }
  try {
    const parsed = new URL(url);
    const hay = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
    return /\/trap\/|\/function\.html|\/cgi-bin\/|bit\.ly|tinyurl\.com|t\.co\//i.test(hay);
  } catch {
    return true;
  }
}

export function hitMentionsPerson(
  hit: { url: string; title: string; snippet?: string },
  fullName: string,
): boolean {
  const tokens = personNameTokens(fullName);
  if (tokens.length === 0) {
    return true;
  }
  const hay = `${hit.title} ${hit.url} ${hit.snippet ?? ""}`.toLowerCase();
  const matches = tokens.filter((token) => hay.includes(token));
  if (tokens.some((token) => token.length >= 7 || token.includes("-"))) {
    return matches.some((token) => token.length >= 6);
  }
  return matches.length >= Math.min(2, tokens.length);
}

export function isPlausibleJobTitle(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 80) {
    return false;
  }
  if (/employee of the /i.test(trimmed)) {
    return false;
  }
  if (/annual report|\brecognized as\b|\bwas an?\b/i.test(trimmed)) {
    return false;
  }
  if (/[.!?]/.test(trimmed) && trimmed.split(/\s+/).length > 8) {
    return false;
  }
  return true;
}

const LEGAL_REGISTRY_PATTERN =
  /odage\.ch|ordre[- ]des[- ]avocats|barreau|anwaltskammer|law[- ]society|bar association|annuaire-des-membres|attorney[- ]directory/i;
const LEGAL_FIRM_PATTERN =
  /associ[ée]|avocat|\battorneys?\b|\blawyers?\b|\blaw\s*firm\b|\brechtsanw|\bstudio legale\b|\bsolicitors?\b/i;
const LEGAL_TITLE_PATTERN =
  /\b(avocat(?:e)?|attorney(?:-at-law)?|lawyer|counsel|solicitor|rechtsanwalt)\b/i;
const LEGAL_INDUSTRY_PATTERN = /\b(legal|law|juridique|avocat)\b/i;

export type OccupationalRoleEvidence = {
  jobTitle?: string | null;
  industry?: string | null;
  companyName?: string | null;
  professionalProfileUrl?: string | null;
  otherProfessional?: string | null;
  hits?: Array<{ url: string; title: string; snippet?: string }>;
};

export type OccupationalRoleInference = {
  jobTitle: string;
  industry: string;
  sourceUrls: string[];
  rationale: string;
};

function occupationalHaystack(input: OccupationalRoleEvidence): string {
  return [
    input.jobTitle,
    input.industry,
    input.companyName,
    input.professionalProfileUrl,
    input.otherProfessional,
    ...(input.hits ?? []).map((hit) => `${hit.title} ${hit.url} ${hit.snippet ?? ""}`),
  ]
    .filter(Boolean)
    .join(" \n ");
}

function matchingOccupationalUrls(input: OccupationalRoleEvidence, pattern: RegExp): string[] {
  const urls: string[] = [];
  if (input.professionalProfileUrl && pattern.test(input.professionalProfileUrl)) {
    urls.push(input.professionalProfileUrl);
  }
  for (const hit of input.hits ?? []) {
    if (pattern.test(`${hit.url} ${hit.title} ${hit.snippet ?? ""}`)) {
      urls.push(hit.url);
    }
  }
  return [...new Set(urls.filter((url) => url.startsWith("https://")))];
}

export function inferOccupationalRole(
  input: OccupationalRoleEvidence,
): OccupationalRoleInference | null {
  const existingTitle = input.jobTitle?.trim();
  if (existingTitle && isPlausibleJobTitle(existingTitle)) {
    return {
      jobTitle: existingTitle,
      industry:
        input.industry?.trim() || (LEGAL_TITLE_PATTERN.test(existingTitle) ? "Legal" : ""),
      sourceUrls: matchingOccupationalUrls(input, LEGAL_TITLE_PATTERN),
      rationale: "Job title already on the lead.",
    };
  }

  const hay = occupationalHaystack(input);
  const french = /odage|avocat|associ[ée]|gen[eè]ve|suisse|barreau/i.test(hay);
  const registryUrls = matchingOccupationalUrls(input, LEGAL_REGISTRY_PATTERN);
  const firmUrls = matchingOccupationalUrls(input, LEGAL_FIRM_PATTERN);
  const titleUrls = matchingOccupationalUrls(input, LEGAL_TITLE_PATTERN);
  const isLegal =
    registryUrls.length > 0 ||
    LEGAL_FIRM_PATTERN.test(input.companyName ?? "") ||
    LEGAL_TITLE_PATTERN.test(hay) ||
    LEGAL_REGISTRY_PATTERN.test(input.professionalProfileUrl ?? "") ||
    LEGAL_INDUSTRY_PATTERN.test(input.industry ?? "");

  if (!isLegal) {
    return null;
  }

  const jobTitle = french ? "Avocat" : "Attorney";
  let sourceUrls =
    registryUrls.length > 0 ? registryUrls : titleUrls.length > 0 ? titleUrls : firmUrls;
  if (sourceUrls.length === 0 && input.professionalProfileUrl?.startsWith("https://")) {
    sourceUrls = [input.professionalProfileUrl];
  }
  if (sourceUrls.length === 0) {
    sourceUrls = [...new Set((input.hits ?? []).map((hit) => hit.url).filter((url) => url.startsWith("https://")))];
  }
  return {
    jobTitle,
    industry: input.industry?.trim() || "Legal",
    sourceUrls,
    rationale: french
      ? "Bar directory or law-firm listing implies a practising avocat."
      : "Bar directory or law-firm listing implies a practising attorney.",
  };
}

export function mergeInferredOccupationalSuggestions(input: {
  suggestions: Array<{
    fieldKey: string;
    value: string;
    confidencePercent: number;
    rationale: string;
    sourceUrls: string[];
  }>;
  hits: Array<{ url: string; title: string; snippet?: string }>;
  known?: {
    jobTitle?: string | null;
    industry?: string | null;
    companyName?: string | null;
    professionalProfileUrl?: string | null;
  };
}): Array<{
  fieldKey: string;
  value: string;
  confidencePercent: number;
  rationale: string;
  sourceUrls: string[];
}> {
  const suggestions = [...input.suggestions];
  const hasTitle = suggestions.some((row) => row.fieldKey === "jobTitle" && row.value.trim());
  const hasIndustry = suggestions.some((row) => row.fieldKey === "industry" && row.value.trim());
  if (hasTitle && hasIndustry) {
    return suggestions;
  }

  const companyName =
    input.known?.companyName ??
    suggestions.find((row) => row.fieldKey === "companyName")?.value ??
    null;
  const professionalProfileUrl =
    input.known?.professionalProfileUrl ??
    suggestions.find((row) => row.fieldKey === "professionalProfileUrl")?.value ??
    null;
  const inferred = inferOccupationalRole({
    jobTitle: hasTitle ? suggestions.find((row) => row.fieldKey === "jobTitle")?.value : input.known?.jobTitle,
    industry: hasIndustry
      ? suggestions.find((row) => row.fieldKey === "industry")?.value
      : input.known?.industry,
    companyName,
    professionalProfileUrl,
    hits: input.hits,
  });
  if (!inferred) {
    return suggestions;
  }
  const fallbackUrls =
    suggestions
      .find((row) => row.fieldKey === "companyName" || row.fieldKey === "professionalProfileUrl")
      ?.sourceUrls.filter((url) => url.startsWith("https://")) ?? [];
  const sourceUrls = inferred.sourceUrls.length > 0 ? inferred.sourceUrls : fallbackUrls;
  if (sourceUrls.length === 0) {
    return suggestions;
  }

  if (!hasTitle) {
    suggestions.push({
      fieldKey: "jobTitle",
      value: inferred.jobTitle,
      confidencePercent: 75,
      rationale: inferred.rationale,
      sourceUrls,
    });
  }
  if (!hasIndustry) {
    suggestions.push({
      fieldKey: "industry",
      value: inferred.industry,
      confidencePercent: 75,
      rationale: inferred.rationale,
      sourceUrls,
    });
  }
  return suggestions;
}

export function mergeEnrichmentHits(
  groups: Array<Array<{ url: string; title: string; snippet: string; retrievedAt: string }>>,
): Array<{ url: string; title: string; snippet: string; retrievedAt: string }> {
  const merged = new Map<
    string,
    { url: string; title: string; snippet: string; retrievedAt: string }
  >();
  for (const group of groups) {
    for (const hit of group) {
      const key = canonicalizeEnrichmentUrl(hit.url);
      if (!key || merged.has(key)) {
        continue;
      }
      merged.set(key, { ...hit, url: key });
    }
  }
  return [...merged.values()].slice(0, 12);
}

export function filterEnrichmentHitsForPerson(
  hits: Array<{ url: string; title: string; snippet: string; retrievedAt: string }>,
  fullName: string,
  marketHints: string[] = [],
): Array<{ url: string; title: string; snippet: string; retrievedAt: string }> {
  const filtered = hits.filter(
    (hit) => !isLowQualityEnrichmentUrl(hit.url) && hitMentionsPerson(hit, fullName),
  );
  return rankEnrichmentHits(filtered, marketHints);
}

/** Citations must come from retrieved search hits, not model-invented URLs. */
export function citeOnlyRetrievedUrls(
  urls: string[],
  retrievedUrls: Iterable<string>,
): string[] {
  const byCanonical = new Map<string, string>();
  for (const url of retrievedUrls) {
    const key = canonicalizeEnrichmentUrl(url);
    if (key && !byCanonical.has(key)) {
      byCanonical.set(key, key);
    }
  }
  const out: string[] = [];
  for (const url of urls) {
    const key = canonicalizeEnrichmentUrl(url);
    const matched = key ? byCanonical.get(key) : undefined;
    if (matched && !out.includes(matched)) {
      out.push(matched);
    }
  }
  return out;
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
  confidence = Math.min(confidence, SOURCED_CONFIDENCE_CAP);
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
