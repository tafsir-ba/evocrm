import { describe, expect, it } from "vitest";

import {
  addMinutesToCampaignSendTime,
  applyCampaignVariables,
  emailBodyHasUnsubscribe,
  getZeroDelaySendTimePredecessorIssue,
  getZeroDelaySendTimeSequenceIssue,
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
    expect(emailBodyHasUnsubscribe('<a href="https://example.com/unsubscribe">Unsubscribe</a>')).toBe(
      true,
    );
    expect(emailBodyHasUnsubscribe("test{{first_name}}")).toBe(false);
    expect(emailBodyHasUnsubscribe("No unsubscribe here")).toBe(false);
  });

  it("detects out-of-order zero-delay send times", () => {
    expect(
      getZeroDelaySendTimeSequenceIssue([
        { order: 1, delayDays: 0, sendTime: "20:15" },
        { order: 2, delayDays: 0, sendTime: "20:13" },
      ]),
    ).toContain("Step 2");
  });

  it("allows saving a later step when an earlier pair is out of order", () => {
    const steps = [
      { order: 1, delayDays: 0, sendTime: "20:11" },
      { order: 2, delayDays: 0, sendTime: "20:15" },
      { order: 3, delayDays: 0, sendTime: "20:13" },
      { order: 4, delayDays: 0, sendTime: "20:15" },
    ];

    expect(getZeroDelaySendTimeSequenceIssue(steps)).toContain("Step 3");
    expect(
      getZeroDelaySendTimePredecessorIssue(
        { order: 5, delayDays: 0, sendTime: "20:30" },
        [...steps, { order: 5, delayDays: 0, sendTime: "20:30" }],
      ),
    ).toBeNull();
  });

  it("blocks saving a step that violates its predecessor", () => {
    expect(
      getZeroDelaySendTimePredecessorIssue(
        { order: 3, delayDays: 0, sendTime: "20:13" },
        [
          { order: 1, delayDays: 0, sendTime: "20:11" },
          { order: 2, delayDays: 0, sendTime: "20:15" },
          { order: 3, delayDays: 0, sendTime: "20:13" },
        ],
      ),
    ).toContain("Step 3");
  });

  it("adds minutes to campaign send time", () => {
    expect(addMinutesToCampaignSendTime("20:15", 1)).toBe("20:16");
    expect(addMinutesToCampaignSendTime("23:59", 1)).toBe("00:00");
  });
});
