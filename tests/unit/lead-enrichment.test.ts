import { describe, expect, it } from "vitest";

import {
  clampConfidence,
  contentLooksExcluded,
  crmValueRequiresOverwrite,
  HIGH_CONFIDENCE_THRESHOLD,
  isSafeToAutoApplySuggestion,
  citeOnlyRetrievedUrls,
  originLabel,
  sanitizeEnrichmentText,
} from "@/lib/lead-enrichment";
import { getLeadEnrichmentDemoFixture, DEMO_AMBIGUOUS_EMAIL, DEMO_UNIQUE_EMAIL } from "@/tests/fixtures/lead-enrichment-demo";
import { parseOccupationalWageRange } from "@/lib/lead-financial-situation";

describe("lead enrichment contract", () => {
  it("drops high-confidence suggestions without an https source", () => {
    expect(
      clampConfidence({
        confidencePercent: HIGH_CONFIDENCE_THRESHOLD,
        sourceUrls: [],
      }).dropped,
    ).toBe(true);
    expect(
      clampConfidence({
        confidencePercent: 90,
        sourceUrls: ["https://example.com/profile"],
      }),
    ).toEqual({ confidencePercent: 90, dropped: false });
  });

  it("caps unsourced low confidence and never treats it as a truth claim", () => {
    expect(
      clampConfidence({ confidencePercent: 55, sourceUrls: ["http://insecure.example"] }),
    ).toEqual({ confidencePercent: 40, dropped: false });
  });

  it("requires overwrite acknowledgement for CRM-entered values", () => {
    expect(crmValueRequiresOverwrite("Director", "manual")).toBe(true);
    expect(crmValueRequiresOverwrite("Director", "import")).toBe(true);
    expect(crmValueRequiresOverwrite("Director", "enrichment")).toBe(false);
    expect(crmValueRequiresOverwrite(null, "manual")).toBe(false);
    expect(isSafeToAutoApplySuggestion({ currentValue: null, currentOrigin: null })).toBe(true);
    expect(
      isSafeToAutoApplySuggestion({ currentValue: "Director", currentOrigin: "manual" }),
    ).toBe(false);
  });

  it("excludes health, credentials, and home-address content", () => {
    expect(contentLooksExcluded("passport number 123")).toBe(true);
    expect(contentLooksExcluded("home address 12 Rue X")).toBe(true);
    expect(sanitizeEnrichmentText("Head of Sales")).toBe("Head of Sales");
    expect(sanitizeEnrichmentText("credit score 800")).toBeNull();
  });

  it("labels enrichment origin distinctly", () => {
    expect(originLabel("enrichment")).toBe("Enriched");
    expect(originLabel("manual")).toBe("CRM");
  });

  it("keeps only retrieved https citations and drops invented URLs", () => {
    const cited = citeOnlyRetrievedUrls(
      [
        "https://www.example-corp.ch/team/amira-keller",
        "https://invented.example/profile",
        "http://insecure.example/page",
      ],
      ["https://www.example-corp.ch/team/amira-keller"],
    );
    expect(cited).toEqual(["https://www.example-corp.ch/team/amira-keller"]);
    expect(
      citeOnlyRetrievedUrls(
        ["https://invented.example/profile"],
        ["https://www.example-corp.ch/team/amira-keller"],
      ),
    ).toEqual([]);
  });

  it("returns no suggestions for ambiguous demo identity", () => {
    const fixture = getLeadEnrichmentDemoFixture({
      fullName: "John Smith",
      email: DEMO_AMBIGUOUS_EMAIL,
    });
    expect(fixture.identityMatch).toBe("ambiguous");
    expect(fixture.suggestions).toEqual([]);
  });

  it("returns cited unique demo suggestions", () => {
    const fixture = getLeadEnrichmentDemoFixture({
      fullName: "Amira Keller",
      email: DEMO_UNIQUE_EMAIL,
    });
    expect(fixture.identityMatch).toBe("unique");
    expect(fixture.suggestions.length).toBeGreaterThan(0);
    expect(fixture.suggestions.every((item) => item.sourceUrls[0]?.startsWith("https://"))).toBe(
      true,
    );
  });

  it("parses occupational wage ranges only from retrieved https snippets", () => {
    expect(
      parseOccupationalWageRange([
        {
          url: "https://stats.example/wages",
          title: "Wage table",
          snippet: "Typical range 90,000 to 130000 for this role.",
        },
      ]),
    ).toEqual({
      rangeMin: 90000,
      rangeMax: 130000,
      sources: [{ url: "https://stats.example/wages", title: "Wage table" }],
    });
    expect(
      parseOccupationalWageRange([
        { url: "https://stats.example/wages", title: "No numbers", snippet: "See PDF." },
      ]),
    ).toBeNull();
  });
});
