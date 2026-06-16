import { describe, expect, it } from "vitest";

import { isEnrollmentRulesReady } from "@/server/services/campaign-readiness";
import { isCampaignStepLaunchReady } from "@/lib/campaign-step-readiness";

describe("campaign readiness", () => {
  it("treats manual-only campaigns as enrollment-ready", () => {
    expect(
      isEnrollmentRulesReady({
        autoEnrollmentEnabled: true,
        enrollmentTrigger: "manual_only",
        enrollmentRules: { logic: "AND", conditions: [] },
      }),
    ).toBe(true);
  });

  it("requires conditions when auto-enrollment is enabled", () => {
    expect(
      isEnrollmentRulesReady({
        autoEnrollmentEnabled: true,
        enrollmentTrigger: "new_lead",
        enrollmentRules: { logic: "AND", conditions: [] },
      }),
    ).toBe(false);
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
