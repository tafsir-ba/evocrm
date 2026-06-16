import { describe, expect, it } from "vitest";

import { isEnrollmentRulesReady } from "@/server/services/campaign-readiness";

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
});
