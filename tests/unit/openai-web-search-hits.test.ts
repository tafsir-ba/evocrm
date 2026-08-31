import { describe, expect, it } from "vitest";

import { extractOpenAiWebSearchHits } from "@/lib/openai-web-search-hits";

describe("extractOpenAiWebSearchHits", () => {
  const retrievedAt = "2026-08-31T18:00:00.000Z";

  it("reads url_citation annotations and web_search_call sources, not only raw text URLs", () => {
    const payload = {
      output_text: "Alisa is Head of Sales at Example Corp.",
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [{ url: "https://www.example-corp.ch/team/alisa" }],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Public team page lists Alisa Scarlett-Buchanan.",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://www.example-corp.ch/about",
                  title: "About Example Corp",
                },
              ],
            },
          ],
        },
      ],
    };

    const { hits, extraText } = extractOpenAiWebSearchHits(payload, retrievedAt);
    expect(hits.map((hit) => hit.url).sort()).toEqual([
      "https://www.example-corp.ch/about",
      "https://www.example-corp.ch/team/alisa",
    ]);
    expect(hits.find((hit) => hit.url.endsWith("/about"))?.title).toBe("About Example Corp");
    expect(extraText).toContain("Head of Sales");
  });

  it("returns no hits when the model replied without citations", () => {
    expect(
      extractOpenAiWebSearchHits({ output_text: "I could not find this person." }, retrievedAt)
        .hits,
    ).toEqual([]);
  });
});
