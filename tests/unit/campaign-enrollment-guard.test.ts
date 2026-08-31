import { describe, expect, it } from "vitest";

import {
  buildMigratedCampaignGuardAttributes,
  isAutomaticEnrollmentSource,
  isBlockedFromAutomaticCampaignEnrollment,
  isHubSpotOrLegacyMigratedLead,
} from "@/lib/campaign-enrollment-guard";

describe("campaign enrollment guard", () => {
  it("does not treat organic leads as automatically blocked", () => {
    expect(isBlockedFromAutomaticCampaignEnrollment({})).toBe(false);
    expect(
      isBlockedFromAutomaticCampaignEnrollment({ integration: { inboundSource: "website" } }),
    ).toBe(false);
    expect(isHubSpotOrLegacyMigratedLead({ integration: { inboundSource: "hero-form" } })).toBe(
      false,
    );
    expect(
      isBlockedFromAutomaticCampaignEnrollment({
        integration: {
          inboundSource: "hubspot",
          idempotencyKey: "hubspot:contact:99",
          acquisitionChannel: "organic_inbound",
        },
      }),
    ).toBe(false);
  });

  it("blocks automatic enrollment for HubSpot keys, inbound sources, and stamped policy", () => {
    expect(
      isBlockedFromAutomaticCampaignEnrollment({
        integration: { idempotencyKey: "hubspot:contact:99" },
      }),
    ).toBe(true);
    expect(
      isBlockedFromAutomaticCampaignEnrollment({
        integration: { inboundSource: "hubspot-gv-pilot" },
      }),
    ).toBe(true);
    expect(
      isBlockedFromAutomaticCampaignEnrollment({
        integration: { inboundSource: "hubspot-wd-project" },
      }),
    ).toBe(true);
    expect(isBlockedFromAutomaticCampaignEnrollment(buildMigratedCampaignGuardAttributes())).toBe(
      true,
    );
  });

  it("classifies only auto-enroll sources as automatic", () => {
    expect(isAutomaticEnrollmentSource("manual")).toBe(false);
    expect(isAutomaticEnrollmentSource("rule_based_auto_enrollment")).toBe(true);
    expect(isAutomaticEnrollmentSource("project_auto_enroll")).toBe(true);
  });
});
