import { describe, expect, it } from "vitest";

import { isEnrollmentRulesReady } from "@/server/services/campaign-readiness";
import { campaignHasSenderContactName } from "@/lib/campaign-from-name";
import { isCampaignStepLaunchReady } from "@/lib/campaign-step-readiness";

describe("campaign readiness", () => {
  it("treats manual-only auto-enrollment as not launch-ready", () => {
    expect(
      isEnrollmentRulesReady({
        autoEnrollmentEnabled: true,
        enrollmentTrigger: "manual_only",
        enrollmentRules: { logic: "AND", conditions: [] },
      }),
    ).toBe(false);
  });

  it("allows auto-enrollment without conditions", () => {
    expect(
      isEnrollmentRulesReady({
        autoEnrollmentEnabled: true,
        enrollmentTrigger: "new_lead",
        enrollmentRules: { logic: "AND", conditions: [] },
      }),
    ).toBe(true);
  });

  it("requires an explicit sender contact name for launch readiness", () => {
    expect(
      campaignHasSenderContactName({
        senderName: null,
        defaultFromName: null,
      }),
    ).toBe(false);
    expect(
      campaignHasSenderContactName({
        senderName: "Grosvenor",
        defaultFromName: null,
      }),
    ).toBe(true);
  });

  it("treats ready status without unsubscribe content as not launch-ready", () => {
    expect(
      isCampaignStepLaunchReady({
        status: "ready",
        subject: "Hello",
        contentMode: "plain_text",
        body: "No unsubscribe here",
        bodyHtml: null,
        bodyText: "No unsubscribe here",
      }),
    ).toBe(false);
  });
});
