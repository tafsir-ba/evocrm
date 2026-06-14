import { describe, expect, it } from "vitest";

import { normalizeFeedbackPageUrl } from "@/server/feedback/page-url";
import { isTrustedFeedbackPageUrl } from "@/lib/feedback";

const APP_URL = "https://crm.evo-home.ch";

describe("normalizeFeedbackPageUrl", () => {
  it("accepts same-origin http/https URLs", () => {
    expect(
      normalizeFeedbackPageUrl("https://crm.evo-home.ch/w/demo/leads", APP_URL),
    ).toBe("https://crm.evo-home.ch/w/demo/leads");
  });

  it("rejects javascript: URLs", () => {
    expect(
      normalizeFeedbackPageUrl("javascript:alert(1)", APP_URL),
    ).toBeNull();
  });

  it("rejects data: URLs", () => {
    expect(
      normalizeFeedbackPageUrl("data:text/html,<script>alert(1)</script>", APP_URL),
    ).toBeNull();
  });

  it("rejects external origins", () => {
    expect(
      normalizeFeedbackPageUrl("https://evil.example/phish", APP_URL),
    ).toBeNull();
  });

  it("returns null for empty values", () => {
    expect(normalizeFeedbackPageUrl("", APP_URL)).toBeNull();
    expect(normalizeFeedbackPageUrl(undefined, APP_URL)).toBeNull();
  });
});

describe("isTrustedFeedbackPageUrl", () => {
  it("mirrors server trust rules for admin rendering", () => {
    expect(
      isTrustedFeedbackPageUrl("https://crm.evo-home.ch/admin/feedback", APP_URL),
    ).toBe(true);
    expect(isTrustedFeedbackPageUrl("javascript:alert(1)", APP_URL)).toBe(false);
    expect(isTrustedFeedbackPageUrl("https://evil.example", APP_URL)).toBe(false);
  });
});
