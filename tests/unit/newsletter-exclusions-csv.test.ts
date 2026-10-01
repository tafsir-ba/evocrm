import { describe, expect, it } from "vitest";

import { buildNewsletterAudienceExclusionsCsv } from "@/server/services/newsletters";

describe("newsletter audience exclusions csv", () => {
  it("includes excluded and flagged unknown-consent rows", () => {
    const csv = buildNewsletterAudienceExclusionsCsv({
      included: [],
      exclusions: [
        {
          leadId: "lead-1",
          email: null,
          fullName: "No Email",
          reason: "missing_email",
        },
        {
          leadId: "lead-2",
          email: "skip@example.com",
          fullName: "Skip Me",
          reason: "unknown_consent",
        },
      ],
      flaggedUnknownConsent: [
        {
          leadId: "lead-3",
          email: "flag@example.com",
          fullName: "Flag Me",
          projectId: "proj-1",
          emailConsentStatus: "unknown",
          segmentIds: ["seg-1"],
          unknownConsent: true,
        },
      ],
      unknownConsentPolicy: "include_and_flag",
      summary: {
        queued: 1,
        excludedMissingEmail: 1,
        excludedUnsubscribed: 0,
        excludedSuppressed: 0,
        excludedInvalid: 0,
        excludedArchived: 0,
        excludedUnknownConsent: 1,
        unknownConsent: 2,
        deduped: 0,
      },
      importSummaries: [],
    });

    expect(csv).toContain("type,reason,fullName,email,leadId");
    expect(csv).toContain("excluded,missing_email,No Email,,lead-1");
    expect(csv).toContain("excluded,unknown_consent,Skip Me,skip@example.com,lead-2");
    expect(csv).toContain(
      "flagged_unknown_consent,unknown_consent,Flag Me,flag@example.com,lead-3",
    );
  });
});
