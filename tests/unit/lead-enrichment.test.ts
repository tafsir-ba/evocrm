import { describe, expect, it } from "vitest";

import {
  clampConfidence,
  contentLooksExcluded,
  crmValueRequiresOverwrite,
  HIGH_CONFIDENCE_THRESHOLD,
  isSafeToAutoApplySuggestion,
  isUniqueEnrichmentReveal,
  citeOnlyRetrievedUrls,
  emailLocalPartToPersonName,
  enrichmentPersonQueryName,
  enrichmentSearchQueries,
  crmOwnedMarketContext,
  enrichmentMarketHints,
  enrichmentPlaceFromProject,
  looksLikeSwissPhone,
  tavilyCountryFromMarketHints,
  preferHitsInProjectMarket,
  rankEnrichmentHits,
  shouldContinueEnrichmentSearch,
  suggestedLocationConflictsWithMarket,
  filterEnrichmentHitsForPerson,
  inferOccupationalRole,
  isPlausibleJobTitle,
  mergeInferredOccupationalSuggestions,
  originLabel,
  sanitizeEnrichmentText,
} from "@/lib/lead-enrichment";
import { getLeadEnrichmentDemoFixture, DEMO_AMBIGUOUS_EMAIL, DEMO_UNIQUE_EMAIL } from "@/tests/fixtures/lead-enrichment-demo";
import {
  parseOccupationalEstimatePayload,
  parseOccupationalWageRange,
  hasOccupationalEstimateInputs,
  resolveOccupationalJobTitle,
  shouldRequestMarketEstimateAfterEnrichment,
} from "@/lib/lead-financial-situation";

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
    ).toEqual({ confidencePercent: 85, dropped: false });
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
    expect(
      citeOnlyRetrievedUrls(
        ["https://theorg.com/org/neho?utm_source=openai"],
        ["https://theorg.com/org/neho/"],
      ),
    ).toEqual(["https://theorg.com/org/neho"]);
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
    expect(
      parseOccupationalWageRange([
        {
          url: "https://stats.example/wages",
          title: "Swiss CTO pay",
          snippet: "Typical band 180k to 260k CHF.",
        },
      ]),
    ).toEqual({
      rangeMin: 180000,
      rangeMax: 260000,
      sources: [{ url: "https://stats.example/wages", title: "Swiss CTO pay" }],
    });
    expect(
      parseOccupationalEstimatePayload({
        rangeMin: 160000,
        rangeMax: 240000,
        confidencePercent: 90,
        methodology: "Swiss tech CTO band",
      }),
    ).toEqual({
      rangeMin: 160000,
      rangeMax: 240000,
      confidencePercent: 55,
      methodology: "Swiss tech CTO band",
    });
  });

  it("treats unique accepted/reviewing runs as a one-click profile reveal", () => {
    expect(isUniqueEnrichmentReveal({ status: "accepted", identityMatch: "unique" })).toBe(true);
    expect(isUniqueEnrichmentReveal({ status: "reviewing", identityMatch: "unique" })).toBe(true);
    expect(isUniqueEnrichmentReveal({ status: "ambiguous", identityMatch: "ambiguous" })).toBe(
      false,
    );
    expect(isUniqueEnrichmentReveal({ status: "failed", identityMatch: "none" })).toBe(false);
  });

  it("requests a labelled occupational estimate after a unique reveal with a role and location", () => {
    expect(
      shouldRequestMarketEstimateAfterEnrichment({
        uniqueReveal: true,
        jobTitle: "Head of Sales",
        city: "Zürich",
        stateRegion: null,
        country: "Switzerland",
      }),
    ).toBe(true);
    expect(
      shouldRequestMarketEstimateAfterEnrichment({
        uniqueReveal: true,
        jobTitle: "Head of Sales",
        city: null,
        stateRegion: null,
        country: null,
      }),
    ).toBe(false);
    expect(
      shouldRequestMarketEstimateAfterEnrichment({
        uniqueReveal: false,
        jobTitle: "Head of Sales",
        country: "Switzerland",
      }),
    ).toBe(false);
    expect(
      shouldRequestMarketEstimateAfterEnrichment({
        uniqueReveal: true,
        jobTitle: null,
        companyName: "Renold & Associé·e·s",
        professionalProfileUrl:
          "https://odage.ch/fr/annuaire-des-membres/angelique-almeida-da-silva",
        city: "Genève",
        country: "Suisse",
      }),
    ).toBe(true);
    expect(
      hasOccupationalEstimateInputs({
        jobTitle: null,
        companyName: "Acme Widgets",
        city: "Genève",
        country: "Suisse",
      }),
    ).toBe(false);
  });

  it("infers avocat / legal from a Geneva bar listing and law-firm name", () => {
    const inferred = inferOccupationalRole({
      companyName: "Renold & Associé·e·s",
      professionalProfileUrl:
        "https://odage.ch/fr/annuaire-des-membres/angelique-almeida-da-silva",
      hits: [
        {
          url: "https://odage.ch/fr/annuaire-des-membres/angelique-almeida-da-silva",
          title: "Angélique Almeida Da Silva - Ordre des avocats de Genève",
          snippet: "Membre de l’Ordre des avocats de Genève",
        },
      ],
    });
    expect(inferred).toMatchObject({
      jobTitle: "Avocat",
      industry: "Legal",
    });
    expect(inferred?.sourceUrls).toContain(
      "https://odage.ch/fr/annuaire-des-membres/angelique-almeida-da-silva",
    );
    expect(isPlausibleJobTitle("Avocat")).toBe(true);
    expect(
      resolveOccupationalJobTitle({
        companyName: "Renold & Associé·e·s",
        city: "Genève",
        country: "Suisse",
      }),
    ).toEqual({ jobTitle: "Avocat", inferred: true });
  });

  it("fills missing job title and industry suggestions from bar-directory hits", () => {
    const merged = mergeInferredOccupationalSuggestions({
      suggestions: [
        {
          fieldKey: "companyName",
          value: "Renold & Associé·e·s",
          confidencePercent: 85,
          rationale: "Employer page",
          sourceUrls: ["https://renlaw.ch/angelique-da-silva"],
        },
        {
          fieldKey: "professionalProfileUrl",
          value: "https://odage.ch/fr/annuaire-des-membres/angelique-almeida-da-silva",
          confidencePercent: 85,
          rationale: "Geneva bar directory",
          sourceUrls: [
            "https://odage.ch/fr/annuaire-des-membres/angelique-almeida-da-silva",
          ],
        },
      ],
      hits: [
        {
          url: "https://odage.ch/fr/annuaire-des-membres/angelique-almeida-da-silva",
          title: "Angélique Almeida Da Silva",
          snippet: "Avocate à Genève",
        },
      ],
    });
    expect(merged.find((row) => row.fieldKey === "jobTitle")).toMatchObject({
      value: "Avocat",
      sourceUrls: [
        "https://odage.ch/fr/annuaire-des-membres/angelique-almeida-da-silva",
      ],
    });
    expect(merged.find((row) => row.fieldKey === "industry")).toMatchObject({
      value: "Legal",
    });
  });

  it("searches the distinctive name, then email, then work domain, LinkedIn, and market", () => {
    expect(enrichmentSearchQueries("Alisa Scarlett-Buchanan", "alisa@evo-home.ch")).toEqual([
      '"Alisa Scarlett-Buchanan"',
      '"Alisa Scarlett-Buchanan" "alisa@evo-home.ch"',
      '"Alisa Scarlett-Buchanan" evo-home.ch',
      '"Alisa Scarlett-Buchanan" LinkedIn',
    ]);
    expect(enrichmentSearchQueries("Alisa Scarlett-Buchanan", "alisa@gmail.com")).toEqual([
      '"Alisa Scarlett-Buchanan"',
      '"Alisa Scarlett-Buchanan" "alisa@gmail.com"',
      '"Alisa Scarlett-Buchanan" LinkedIn',
    ]);
    expect(
      enrichmentSearchQueries("philippe.nougaret@gmail.com", "philippe.nougaret@gmail.com", {
        phone: "0763162433",
      }),
    ).toEqual([
      '"philippe nougaret" Switzerland',
      '"philippe nougaret" LinkedIn Switzerland',
      '"philippe nougaret" "philippe.nougaret@gmail.com"',
      '"philippe nougaret" LinkedIn',
      '"philippe nougaret"',
    ]);
    expect(enrichmentSearchQueries("radu@neho.ch", "radu@neho.ch")).toEqual([
      '"radu"',
      '"radu" "radu@neho.ch"',
      '"radu" neho.ch',
      '"radu" LinkedIn',
    ]);
  });

  it("strips a year from an email-as-name so Yanis Berger is searchable", () => {
    expect(emailLocalPartToPersonName("yanis_berger96")).toBe("yanis berger");
    expect(
      enrichmentPersonQueryName("yanis_berger96@wls1.com", "yanis_berger96@wls1.com"),
    ).toBe("yanis berger");
    expect(
      enrichmentPlaceFromProject({
        location: {
          countryCode: "CH",
          cantonName: "Vaud",
          municipality: "Brent",
        },
      }).searchPlace,
    ).toBe("Montreux");
    expect(
      enrichmentSearchQueries("yanis_berger96@wls1.com", "yanis_berger96@wls1.com", {
        searchPlace: "Montreux",
      }),
    ).toEqual([
      '"yanis berger" Montreux',
      '"yanis berger" LinkedIn Montreux',
      '"yanis berger" "yanis_berger96@wls1.com"',
      '"yanis berger" wls1.com',
      '"yanis berger" LinkedIn',
      '"yanis berger"',
    ]);
  });

  it("nails a common name to the project area, not a global search", () => {
    expect(
      enrichmentPlaceFromProject({
        city: "Cressy",
        country: "Switzerland",
        location: {
          countryCode: "CH",
          countryName: "Switzerland",
          cantonCode: "GE",
          cantonName: "Genève",
          municipality: "Confignon",
        },
      }),
    ).toEqual({
      city: "Geneva",
      stateRegion: "Geneva",
      country: "Switzerland",
      searchPlace: "Geneva",
    });
    expect(tavilyCountryFromMarketHints(["Geneva", "Suisse"])).toBe("switzerland");
    expect(tavilyCountryFromMarketHints(["Montréal"])).toBe("canada");
    expect(
      enrichmentSearchQueries("carmen smith", "carmen.smith2@hotmail.com", {
        searchPlace: "Geneva",
      }),
    ).toEqual([
      '"carmen smith" Geneva',
      '"carmen smith" LinkedIn Geneva',
      '"carmen smith" "carmen.smith2@hotmail.com"',
      '"carmen smith" LinkedIn',
      '"carmen smith"',
    ]);
  });

  it("keeps the person in the project market when the same name appears abroad", () => {
    const canada = {
      url: "https://theorg.com/org/cdpq/org-chart/philippe-nougaret",
      title: "Philippe Nougaret — CDPQ",
      snippet: "Vice President, Montréal, Canada",
      retrievedAt: "2026-08-31T12:00:00.000Z",
    };
    const switzerland = {
      url: "https://www.linkedin.com/in/philippe-nougaret",
      title: "Philippe Nougaret - CPW – Nestlé",
      snippet: "Regional Marketing Director Europe, Lausanne",
      retrievedAt: "2026-08-31T12:00:00.000Z",
    };
    const hints = ["Montreux", "Switzerland", "Suisse"];
    expect(preferHitsInProjectMarket([canada, switzerland], hints)).toEqual({
      hits: [switzerland],
      narrowed: true,
    });
    expect(preferHitsInProjectMarket([canada], hints)).toEqual({
      hits: [canada],
      narrowed: false,
    });
  });

  it("uses Swiss mobile and CHF as market clues, and ignores enrichment-written city", () => {
    expect(looksLikeSwissPhone("0763162433")).toBe(true);
    expect(looksLikeSwissPhone("+41763162433")).toBe(true);
    expect(enrichmentMarketHints({ phone: "0763162433" })).toEqual(
      expect.arrayContaining(["Switzerland", "Suisse"]),
    );
    expect(
      crmOwnedMarketContext({
        phone: "0763162433",
        city: "Montréal",
        country: "Canada",
        cityOrigin: "enrichment",
        countryOrigin: "enrichment",
        defaultCurrency: "CHF",
      }),
    ).toEqual({
      phone: "0763162433",
      city: null,
      stateRegion: null,
      country: null,
      defaultCurrency: "CHF",
      searchPlace: "Switzerland",
    });
    expect(
      crmOwnedMarketContext({
        phone: "0795062940",
        city: null,
        country: null,
        defaultCurrency: "CHF",
        project: {
          location: {
            countryCode: "CH",
            cantonCode: "GE",
            cantonName: "Genève",
            municipality: "Confignon",
          },
        },
      }).searchPlace,
    ).toBe("Geneva");
    expect(
      suggestedLocationConflictsWithMarket(
        [
          { fieldKey: "city", value: "Montréal" },
          { fieldKey: "country", value: "Canada" },
        ],
        ["Switzerland", "Suisse"],
      ),
    ).toBe(true);
    expect(
      suggestedLocationConflictsWithMarket(
        [
          { fieldKey: "city", value: "Lausanne" },
          { fieldKey: "country", value: "Switzerland" },
        ],
        ["Switzerland"],
      ),
    ).toBe(false);
  });

  it("keeps searching until LinkedIn or employer pages appear, and ranks them first", () => {
    const theorg = {
      url: "https://theorg.com/org/caisse-de-depot-et-placement-du-quebec/org-chart/philippe-nougaret",
      title: "Philippe Nougaret",
      snippet: "Vice President, Montréal",
      retrievedAt: "2026-08-31T12:00:00.000Z",
    };
    const linkedin = {
      url: "https://www.linkedin.com/in/philippe-nougaret",
      title: "Philippe Nougaret - CPW – Nestlé",
      snippet: "Regional Marketing Director Europe, Lausanne",
      retrievedAt: "2026-08-31T12:00:00.000Z",
    };
    expect(shouldContinueEnrichmentSearch([theorg], ["Switzerland"])).toBe(true);
    expect(shouldContinueEnrichmentSearch([linkedin, theorg], ["Switzerland"])).toBe(false);
    expect(
      rankEnrichmentHits([theorg, linkedin], ["Switzerland"]).map((hit) => hit.url),
    ).toEqual([linkedin.url, theorg.url]);
  });

  it("rejects sentence-like job titles and trap citations", () => {
    expect(isPlausibleJobTitle("Counsel")).toBe(true);
    expect(isPlausibleJobTitle("Employee of the Corporate Legal Services Division")).toBe(
      false,
    );
    expect(
      filterEnrichmentHitsForPerson(
        [
          {
            url: "https://www.jsimlo.sk/trap/index.php/function.html",
            title: "function",
            snippet: "",
            retrievedAt: "2026-08-31T12:00:00.000Z",
          },
          {
            url: "https://rocketreach.co/alisa-scarlett-buchanan-email",
            title: "Alisa Scarlett-Buchanan Email",
            snippet: "Contact data",
            retrievedAt: "2026-08-31T12:00:00.000Z",
          },
          {
            url: "https://nla.gov.jm/reports/alisa-scarlett-buchanan",
            title: "Alisa Scarlett-Buchanan — National Land Agency",
            snippet: "Legal services division",
            retrievedAt: "2026-08-31T12:00:00.000Z",
          },
        ],
        "Alisa Scarlett-Buchanan",
      ).map((hit) => hit.url),
    ).toEqual(["https://nla.gov.jm/reports/alisa-scarlett-buchanan"]);
  });
});
