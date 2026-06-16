import { describe, expect, it } from "vitest";

import {
  applyCampaignVariables,
  emailBodyHasUnsubscribe,
  isValidCampaignSendTime,
  normalizeCampaignSendTime,
  normalizeCampaignVariableTokens,
} from "@/lib/campaign-email";

describe("campaign email helpers", () => {
  it("normalizes send time to HH:mm", () => {
    expect(normalizeCampaignSendTime("15:59:00")).toBe("15:59");
    expect(normalizeCampaignSendTime(" 09:00 ")).toBe("09:00");
  });

  it("validates normalized send time", () => {
    expect(isValidCampaignSendTime("15:59:00")).toBe(true);
    expect(isValidCampaignSendTime("25:00")).toBe(false);
  });

  it("merges unsubscribe_url in both token formats", () => {
    const context = { unsubscribeUrl: "https://example.com/unsub" };

    expect(applyCampaignVariables("Link: {unsubscribe_url}", context)).toBe(
      "Link: https://example.com/unsub",
    );
    expect(applyCampaignVariables("Link: {{unsubscribe_url}}", context)).toBe(
      "Link: https://example.com/unsub",
    );
  });

  it("merges double-brace name variables", () => {
    expect(
      applyCampaignVariables("Hi {{first_name}}", {
        firstName: "Alex",
      }),
    ).toBe("Hi Alex");
  });

  it("normalizes double-brace tokens to canonical single-brace form", () => {
    expect(normalizeCampaignVariableTokens("Hi {{first_name}}")).toBe("Hi {first_name}");
  });

  it("detects unsubscribe content", () => {
    expect(emailBodyHasUnsubscribe("Thanks\n{unsubscribe_url}")).toBe(true);
    expect(emailBodyHasUnsubscribe("Thanks\n{{unsubscribe_url}}")).toBe(true);
    expect(emailBodyHasUnsubscribe("Thanks\n{unsubscribe_url}")).toBe(true);
    expect(emailBodyHasUnsubscribe('<a href="https://example.com/unsubscribe">Unsubscribe</a>')).toBe(
      true,
    );
    expect(emailBodyHasUnsubscribe("test{{first_name}}")).toBe(false);
    expect(emailBodyHasUnsubscribe("No unsubscribe here")).toBe(false);
  });
});
