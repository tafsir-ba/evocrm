import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({
  getEnv: vi.fn(() => ({
    OPENAI_API_KEY: "sk-test",
    TAVILY_API_KEY: "tvly-test",
    BRAVE_SEARCH_API_KEY: undefined,
    LEAD_ENRICHMENT_DEMO: undefined,
    OPENAI_ENRICHMENT_MODEL: "gpt-4o-mini",
  })),
}));

import { getEnv } from "@/server/env";
import { defaultSearch } from "@/server/services/lead-enrichment-providers";

describe("defaultSearch provider fallthrough", () => {
  beforeEach(() => {
    vi.mocked(getEnv).mockImplementation(
      () =>
        ({
          OPENAI_API_KEY: "sk-test",
          TAVILY_API_KEY: "tvly-test",
          BRAVE_SEARCH_API_KEY: undefined,
          LEAD_ENRICHMENT_DEMO: undefined,
          OPENAI_ENRICHMENT_MODEL: "gpt-4o-mini",
        }) as never,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("falls through to OpenAI when Tavily returns hits that never mention the person", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.tavily.com")) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                url: "https://example.com/geneva-property-news",
                title: "Geneva property prices",
                content: "Local housing market update for Confignon.",
              },
            ],
          }),
        } as Response;
      }
      if (url.includes("api.openai.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            output_text: "Kelly Schmaltzried works in product in Geneva.",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: "Kelly Schmaltzried works in product in Geneva.",
                    annotations: [
                      {
                        type: "url_citation",
                        url: "https://www.linkedin.com/in/kelly-schmaltzried",
                        title: "Kelly Schmaltzried — Product",
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await defaultSearch('"Kelly Schmaltzried" Geneva', [
      "professional_directory",
      "company_website",
      "news_press",
      "professional_registry",
    ] as const);

    expect(result.provider).toBe("openai_web_search");
    expect(result.hits.some((hit) => hit.url.includes("linkedin.com"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("api.openai.com"))).toBe(
      true,
    );
  });

  it("keeps Tavily when at least one hit mentions the person", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.tavily.com")) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                url: "https://www.linkedin.com/in/kelly-schmaltzried",
                title: "Kelly Schmaltzried",
                content: "Product lead in Geneva",
              },
            ],
          }),
        } as Response;
      }
      throw new Error(`OpenAI should not be called: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await defaultSearch('"Kelly Schmaltzried" LinkedIn Geneva', [
      "professional_directory",
    ]);

    expect(result.provider).toBe("tavily");
    expect(result.hits).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
