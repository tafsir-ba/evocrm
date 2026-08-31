import "server-only";

import type { LeadEnrichmentAllowedSource } from "@/lib/lead-enrichment";
import type { LeadEnrichmentFieldKey } from "@/lib/lead-enrichment";
import type { LeadEnrichmentIdentityMatch } from "@/lib/lead-enrichment";
import type { LeadEnrichmentSearchHit } from "@/lib/lead-enrichment";
import { isHttpsUrl } from "@/lib/lead-enrichment";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";

export type SynthesizeInput = {
  fullName: string;
  email: string;
  known: Record<string, string | null>;
  allowedSources: LeadEnrichmentAllowedSource[];
  hits: LeadEnrichmentSearchHit[];
};

export type SynthesizeSuggestion = {
  fieldKey: LeadEnrichmentFieldKey;
  value: string;
  confidencePercent: number;
  rationale: string;
  sourceUrls: string[];
};

export type SynthesizeResult = {
  identityMatch: LeadEnrichmentIdentityMatch;
  identityRationale: string;
  suggestions: SynthesizeSuggestion[];
  summary: { text: string; citationUrls: string[] };
  model: string;
};

export type EnrichmentProviders = {
  search: (
    query: string,
    allowedSources: LeadEnrichmentAllowedSource[],
  ) => Promise<{ hits: LeadEnrichmentSearchHit[]; provider: string }>;
  synthesize: (input: SynthesizeInput) => Promise<SynthesizeResult>;
};

const SOURCE_HINTS: Record<LeadEnrichmentAllowedSource, string> = {
  professional_directory: "public professional directories",
  company_website: "company websites",
  news_press: "news and press",
  professional_registry: "professional registries",
};

export function enrichmentOpenAiModel(): string {
  return getEnv().OPENAI_ENRICHMENT_MODEL ?? "gpt-4o-mini";
}

export function isOpenAiConfigured(): boolean {
  return Boolean(getEnv().OPENAI_API_KEY);
}

export function isSearchConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.TAVILY_API_KEY || env.BRAVE_SEARCH_API_KEY || env.OPENAI_API_KEY);
}

export function isDemoEnvEnabled(): boolean {
  const flag = getEnv().LEAD_ENRICHMENT_DEMO?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function allowedSourceHint(allowedSources: LeadEnrichmentAllowedSource[]): string {
  return allowedSources.map((source) => SOURCE_HINTS[source]).join(", ");
}

async function searchTavily(query: string): Promise<LeadEnrichmentSearchHit[]> {
  const key = getEnv().TAVILY_API_KEY;
  if (!key) {
    return [];
  }
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      include_answer: false,
      max_results: 8,
    }),
  });
  if (!response.ok) {
    throw new AppError("INTERNAL_ERROR", "Search provider request failed.", {
      details: { status: response.status, provider: "tavily" },
    });
  }
  const payload = (await response.json()) as {
    results?: Array<{ url?: string; title?: string; content?: string }>;
  };
  const retrievedAt = new Date().toISOString();
  return (payload.results ?? [])
    .filter((hit) => hit.url && isHttpsUrl(hit.url))
    .map((hit) => ({
      url: hit.url!,
      title: hit.title ?? hit.url!,
      snippet: (hit.content ?? "").slice(0, 500),
      retrievedAt,
    }));
}

async function searchBrave(query: string): Promise<LeadEnrichmentSearchHit[]> {
  const key = getEnv().BRAVE_SEARCH_API_KEY;
  if (!key) {
    return [];
  }
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "8");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
  });
  if (!response.ok) {
    throw new AppError("INTERNAL_ERROR", "Search provider request failed.", {
      details: { status: response.status, provider: "brave" },
    });
  }
  const payload = (await response.json()) as {
    web?: { results?: Array<{ url?: string; title?: string; description?: string }> };
  };
  const retrievedAt = new Date().toISOString();
  return (payload.web?.results ?? [])
    .filter((hit) => hit.url && isHttpsUrl(hit.url))
    .map((hit) => ({
      url: hit.url!,
      title: hit.title ?? hit.url!,
      snippet: (hit.description ?? "").slice(0, 500),
      retrievedAt,
    }));
}

async function searchOpenAiWeb(
  query: string,
): Promise<{ hits: LeadEnrichmentSearchHit[]; extraText: string }> {
  const key = getEnv().OPENAI_API_KEY;
  if (!key) {
    return { hits: [], extraText: "" };
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: enrichmentOpenAiModel(),
      tools: [{ type: "web_search_preview" }],
      input: query,
    }),
  });
  if (!response.ok) {
    throw new AppError("INTERNAL_ERROR", "OpenAI web search failed.", {
      details: { status: response.status },
    });
  }
  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  const text =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((part) => part.text ?? "")
      .join("\n") ??
    "";
  const retrievedAt = new Date().toISOString();
  const urls = Array.from(text.matchAll(/https:\/\/[^\s)\]>"']+/g)).map((match) => match[0]!);
  const unique = [...new Set(urls)].slice(0, 8);
  return {
    extraText: text.slice(0, 4000),
    hits: unique.filter(isHttpsUrl).map((url) => ({
      url,
      title: url,
      snippet: "",
      retrievedAt,
    })),
  };
}

export async function defaultSearch(
  query: string,
  allowedSources: LeadEnrichmentAllowedSource[],
): Promise<{ hits: LeadEnrichmentSearchHit[]; provider: string }> {
  const scoped = `${query} ${allowedSourceHint(allowedSources)}`;
  if (getEnv().TAVILY_API_KEY) {
    return { hits: await searchTavily(scoped), provider: "tavily" };
  }
  if (getEnv().BRAVE_SEARCH_API_KEY) {
    return { hits: await searchBrave(scoped), provider: "brave" };
  }
  const openai = await searchOpenAiWeb(scoped);
  return { hits: openai.hits, provider: "openai_web_search" };
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const block = trimmed.match(/\{[\s\S]*\}/);
  const raw = block ? block[0]! : trimmed;
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function defaultSynthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
  const key = getEnv().OPENAI_API_KEY;
  if (!key) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Lead enrichment is disabled until OPENAI_API_KEY is configured on the server.",
    );
  }
  const model = enrichmentOpenAiModel();
  const sources = input.hits
    .map((hit, index) => `${index + 1}. ${hit.title} — ${hit.url}\n${hit.snippet}`)
    .join("\n\n");
  const prompt = `You extract public professional facts for CRM review. Use ONLY the search results. Do not invent facts. If identity is not uniquely matched to name+email, set identityMatch to "ambiguous" or "none" and return no suggestions.

Lead: ${input.fullName} <${input.email}>
Already known: ${JSON.stringify(input.known)}
Allowed sources: ${allowedSourceHint(input.allowedSources)}

Search results:
${sources || "(none)"}

Return JSON:
{
  "identityMatch": "unique" | "ambiguous" | "none",
  "identityRationale": "string",
  "suggestions": [{"fieldKey":"companyName|jobTitle|industry|city|stateRegion|country|preferredContactClues|professionalProfileUrl|otherProfessional","value":"string","confidencePercent":0-100,"rationale":"string","sourceUrls":["https://..."]}],
  "summary": {"text":"cited summary","citationUrls":["https://..."]}
}

Rules: public professional/business info only. Exclude credentials, government IDs, health data, exact home address, minors, protected characteristics, private social material, unverified allegations, and any financial data. Every suggestion needs at least one https source URL from the results. Confidence is source-quality/identity-match, not truth.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You only restate cited public professional facts. Never invent.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    throw new AppError("INTERNAL_ERROR", "Enrichment synthesis failed.", {
      details: { status: response.status },
    });
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  const parsed = parseJsonObject(content);
  const identityMatch = (
    ["unique", "ambiguous", "none"] as LeadEnrichmentIdentityMatch[]
  ).includes(parsed.identityMatch as LeadEnrichmentIdentityMatch)
    ? (parsed.identityMatch as LeadEnrichmentIdentityMatch)
    : "none";
  const suggestionsRaw = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const summaryRaw =
    parsed.summary && typeof parsed.summary === "object"
      ? (parsed.summary as Record<string, unknown>)
      : {};
  return {
    identityMatch,
    identityRationale:
      typeof parsed.identityRationale === "string" ? parsed.identityRationale : "",
    model,
    suggestions: suggestionsRaw.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const row = item as Record<string, unknown>;
      if (typeof row.fieldKey !== "string" || typeof row.value !== "string") {
        return [];
      }
      return [
        {
          fieldKey: row.fieldKey as LeadEnrichmentFieldKey,
          value: row.value,
          confidencePercent: Number(row.confidencePercent) || 0,
          rationale: typeof row.rationale === "string" ? row.rationale : "",
          sourceUrls: Array.isArray(row.sourceUrls)
            ? row.sourceUrls.filter((url): url is string => typeof url === "string")
            : [],
        },
      ];
    }),
    summary: {
      text: typeof summaryRaw.text === "string" ? summaryRaw.text : "",
      citationUrls: Array.isArray(summaryRaw.citationUrls)
        ? summaryRaw.citationUrls.filter((url): url is string => typeof url === "string")
        : [],
    },
  };
}

export const liveEnrichmentProviders: EnrichmentProviders = {
  search: defaultSearch,
  synthesize: defaultSynthesize,
};
