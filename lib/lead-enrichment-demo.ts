import type { LeadEnrichmentSearchHit } from "@/lib/lead-enrichment";
import type { LeadEnrichmentFieldKey } from "@/lib/lead-enrichment";
import type { LeadEnrichmentIdentityMatch } from "@/lib/lead-enrichment";

export const DEMO_UNIQUE_EMAIL = "amira.keller@example.com";
export const DEMO_AMBIGUOUS_EMAIL = "john.smith@example.com";

export type DemoSynthesis = {
  identityMatch: LeadEnrichmentIdentityMatch;
  identityRationale: string;
  suggestions: Array<{
    fieldKey: LeadEnrichmentFieldKey;
    value: string;
    confidencePercent: number;
    rationale: string;
    sourceUrls: string[];
  }>;
  summary: { text: string; citationUrls: string[] };
  hits: LeadEnrichmentSearchHit[];
};

const retrievedAt = "2026-08-31T12:00:00.000Z";

export function getLeadEnrichmentDemoFixture(input: {
  fullName: string;
  email: string;
}): DemoSynthesis {
  const email = input.email.trim().toLowerCase();

  if (email === DEMO_AMBIGUOUS_EMAIL) {
    return {
      identityMatch: "ambiguous",
      identityRationale:
        "Multiple public professionals share this name; email does not uniquely match a single public profile.",
      suggestions: [],
      summary: { text: "", citationUrls: [] },
      hits: [
        {
          url: "https://www.example.com/people/john-smith-geneva",
          title: "John Smith — Geneva",
          snippet: "Several directory listings for John Smith.",
          retrievedAt,
        },
        {
          url: "https://www.example.com/people/john-smith-zurich",
          title: "John Smith — Zurich",
          snippet: "A different John Smith listed in Zurich.",
          retrievedAt,
        },
      ],
    };
  }

  if (email !== DEMO_UNIQUE_EMAIL) {
    return {
      identityMatch: "none",
      identityRationale: "No unique public professional identity matched name and email.",
      suggestions: [],
      summary: { text: "", citationUrls: [] },
      hits: [],
    };
  }

  return {
    identityMatch: "unique",
    identityRationale: "Name and work email match a single company profile page.",
    hits: [
      {
        url: "https://www.example-corp.ch/team/amira-keller",
        title: "Amira Keller — Example Corp",
        snippet: "Amira Keller is Head of Sales at Example Corp in Geneva, Switzerland.",
        retrievedAt,
      },
    ],
    suggestions: [
      {
        fieldKey: "companyName",
        value: "Example Corp",
        confidencePercent: 88,
        rationale: "Employer named on the public team page that lists this email.",
        sourceUrls: ["https://www.example-corp.ch/team/amira-keller"],
      },
      {
        fieldKey: "jobTitle",
        value: "Head of Sales",
        confidencePercent: 86,
        rationale: "Job title published on the same team page.",
        sourceUrls: ["https://www.example-corp.ch/team/amira-keller"],
      },
      {
        fieldKey: "industry",
        value: "Real estate",
        confidencePercent: 72,
        rationale: "Company about page describes a real-estate practice.",
        sourceUrls: ["https://www.example-corp.ch/team/amira-keller"],
      },
      {
        fieldKey: "city",
        value: "Geneva",
        confidencePercent: 80,
        rationale: "Office city listed on the public team page.",
        sourceUrls: ["https://www.example-corp.ch/team/amira-keller"],
      },
      {
        fieldKey: "country",
        value: "Switzerland",
        confidencePercent: 84,
        rationale: "Country listed on the public team page.",
        sourceUrls: ["https://www.example-corp.ch/team/amira-keller"],
      },
      {
        fieldKey: "professionalProfileUrl",
        value: "https://www.example-corp.ch/team/amira-keller",
        confidencePercent: 90,
        rationale: "Canonical public profile URL retrieved during search.",
        sourceUrls: ["https://www.example-corp.ch/team/amira-keller"],
      },
    ],
    summary: {
      text: "Public company team page lists Amira Keller as Head of Sales at Example Corp in Geneva, Switzerland.",
      citationUrls: ["https://www.example-corp.ch/team/amira-keller"],
    },
  };
}
