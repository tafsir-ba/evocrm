import type { LeadEnrichmentCandidate } from "@/lib/lead-enrichment";
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
  candidates?: LeadEnrichmentCandidate[];
};

const retrievedAt = "2026-08-31T12:00:00.000Z";

export function getLeadEnrichmentDemoFixture(input: {
  fullName: string;
  email: string;
}): DemoSynthesis {
  const email = input.email.trim().toLowerCase();

  if (email === DEMO_AMBIGUOUS_EMAIL) {
    const geneva = {
      fieldKey: "jobTitle" as const,
      value: "Head of Sales",
      confidencePercent: 80,
      rationale: "Public Geneva directory lists this John Smith as Head of Sales.",
      sourceUrls: ["https://www.example.com/people/john-smith-geneva"],
    };
    const zurich = {
      fieldKey: "jobTitle" as const,
      value: "Orthopaedic Surgery Resident",
      confidencePercent: 82,
      rationale: "Public Zurich listing describes a different John Smith.",
      sourceUrls: ["https://www.example.com/people/john-smith-zurich"],
    };
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
      candidates: [
        {
          id: "cand-1",
          label: "John Smith — Head of Sales · Geneva",
          headline: "Head of Sales",
          employer: "Example Corp",
          location: "Geneva, Switzerland",
          profileUrl: "https://www.example.com/people/john-smith-geneva",
          sourceUrls: ["https://www.example.com/people/john-smith-geneva"],
          confidencePercent: 80,
          mostLikely: true,
          suggestions: [
            geneva,
            {
              fieldKey: "companyName",
              value: "Example Corp",
              confidencePercent: 78,
              rationale: "Employer named on the Geneva directory page.",
              sourceUrls: ["https://www.example.com/people/john-smith-geneva"],
            },
            {
              fieldKey: "city",
              value: "Geneva",
              confidencePercent: 80,
              rationale: "City listed on the Geneva directory page.",
              sourceUrls: ["https://www.example.com/people/john-smith-geneva"],
            },
            {
              fieldKey: "country",
              value: "Switzerland",
              confidencePercent: 80,
              rationale: "Country listed on the Geneva directory page.",
              sourceUrls: ["https://www.example.com/people/john-smith-geneva"],
            },
          ],
          summary: {
            text: "Public Geneva directory lists John Smith as Head of Sales at Example Corp.",
            citationUrls: ["https://www.example.com/people/john-smith-geneva"],
          },
        },
        {
          id: "cand-2",
          label: "John Smith — Orthopaedic Surgery Resident · Zurich",
          headline: "Orthopaedic Surgery Resident",
          employer: "Hôpital universitaire",
          location: "Zurich, Switzerland",
          profileUrl: "https://www.example.com/people/john-smith-zurich",
          sourceUrls: ["https://www.example.com/people/john-smith-zurich"],
          confidencePercent: 82,
          mostLikely: false,
          suggestions: [
            zurich,
            {
              fieldKey: "companyName",
              value: "Hôpital universitaire",
              confidencePercent: 80,
              rationale: "Hospital named on the Zurich listing.",
              sourceUrls: ["https://www.example.com/people/john-smith-zurich"],
            },
            {
              fieldKey: "city",
              value: "Zurich",
              confidencePercent: 82,
              rationale: "City listed on the Zurich directory page.",
              sourceUrls: ["https://www.example.com/people/john-smith-zurich"],
            },
            {
              fieldKey: "country",
              value: "Switzerland",
              confidencePercent: 80,
              rationale: "Country listed on the Zurich directory page.",
              sourceUrls: ["https://www.example.com/people/john-smith-zurich"],
            },
          ],
          summary: {
            text: "A different John Smith is listed in Zurich as an orthopaedic surgery resident.",
            citationUrls: ["https://www.example.com/people/john-smith-zurich"],
          },
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
