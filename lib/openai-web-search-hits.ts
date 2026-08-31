import { canonicalizeEnrichmentUrl, isHttpsUrl, type LeadEnrichmentSearchHit } from "@/lib/lead-enrichment";

function stripTrailingUrlJunk(url: string): string {
  return url.replace(/[),.;]+$/g, "");
}

function addHit(
  acc: Map<string, LeadEnrichmentSearchHit>,
  url: string,
  title: string,
  snippet: string,
  retrievedAt: string,
) {
  const cleaned = canonicalizeEnrichmentUrl(stripTrailingUrlJunk(url.trim()));
  if (!cleaned || !isHttpsUrl(cleaned)) {
    return;
  }
  const existing = acc.get(cleaned);
  if (!existing) {
    acc.set(cleaned, {
      url: cleaned,
      title: title.trim() || cleaned,
      snippet: snippet.trim().slice(0, 500),
      retrievedAt,
    });
    return;
  }
  if (title.trim() && existing.title === existing.url) {
    existing.title = title.trim();
  }
  if (snippet.trim().length > existing.snippet.length) {
    existing.snippet = snippet.trim().slice(0, 500);
  }
}

/**
 * OpenAI Responses web_search puts URLs in url_citation annotations and
 * web_search_call.action.sources — not reliably as raw https strings in output_text.
 */
export function extractOpenAiWebSearchHits(
  payload: unknown,
  retrievedAt: string,
): { hits: LeadEnrichmentSearchHit[]; extraText: string } {
  const acc = new Map<string, LeadEnrichmentSearchHit>();
  const texts: string[] = [];
  if (!payload || typeof payload !== "object") {
    return { hits: [], extraText: "" };
  }
  const root = payload as Record<string, unknown>;
  if (typeof root.output_text === "string" && root.output_text.trim()) {
    texts.push(root.output_text);
  }
  const output = Array.isArray(root.output) ? root.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    if (row.type === "web_search_call" && row.action && typeof row.action === "object") {
      const action = row.action as Record<string, unknown>;
      const sources = Array.isArray(action.sources) ? action.sources : [];
      for (const source of sources) {
        if (source && typeof source === "object" && typeof (source as { url?: unknown }).url === "string") {
          addHit(acc, (source as { url: string }).url, "", "", retrievedAt);
        }
      }
    }
    const content = Array.isArray(row.content) ? row.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const block = part as Record<string, unknown>;
      if (typeof block.text === "string" && block.text.trim()) {
        texts.push(block.text);
      }
      const annotations = Array.isArray(block.annotations) ? block.annotations : [];
      for (const annotation of annotations) {
        if (!annotation || typeof annotation !== "object") {
          continue;
        }
        const cite = annotation as { url?: unknown; title?: unknown };
        if (typeof cite.url === "string") {
          addHit(
            acc,
            cite.url,
            typeof cite.title === "string" ? cite.title : "",
            "",
            retrievedAt,
          );
        }
      }
    }
  }

  const extraText = texts.join("\n").slice(0, 4000);
  for (const match of extraText.matchAll(/https:\/\/[^\s)\]>"']+/g)) {
    addHit(acc, match[0]!, "", "", retrievedAt);
  }
  return { hits: [...acc.values()].slice(0, 12), extraText };
}
