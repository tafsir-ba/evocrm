import { describe, expect, it } from "vitest";

import {
  buildMarketingManagerOptInPolicy,
  buildMigratedCampaignGuardAttributes,
  canEnrollLeadInCampaigns,
  hasProjectMarketingManagerOptIn,
  isHubSpotOrLegacyMigratedLead,
} from "@/lib/campaign-enrollment-guard";

describe("campaign enrollment guard", () => {
  it("allows organic leads with no HubSpot or migration markers", () => {
    expect(canEnrollLeadInCampaigns({})).toBe(true);
    expect(canEnrollLeadInCampaigns({ integration: { inboundSource: "website" } })).toBe(true);
    expect(isHubSpotOrLegacyMigratedLead({ integration: { inboundSource: "hero-form" } })).toBe(
      false,
    );
  });

  it("blocks HubSpot idempotency keys, inbound sources, and stamped migration policy", () => {
    expect(
      canEnrollLeadInCampaigns({
        integration: { idempotencyKey: "hubspot:contact:99" },
      }),
    ).toBe(false);
    expect(
      canEnrollLeadInCampaigns({
        integration: { inboundSource: "hubspot-gv-pilot" },
      }),
    ).toBe(false);
    expect(canEnrollLeadInCampaigns(buildMigratedCampaignGuardAttributes())).toBe(false);
  });

  it("allows enrollment only after explicit project marketing-manager opt-in", () => {
    const optedIn = {
      ...buildMigratedCampaignGuardAttributes(),
      campaignEnrollmentPolicy: buildMarketingManagerOptInPolicy({ actorId: "mm-1" }),
    };
    expect(isHubSpotOrLegacyMigratedLead(optedIn)).toBe(true);
    expect(hasProjectMarketingManagerOptIn(optedIn)).toBe(true);
    expect(canEnrollLeadInCampaigns(optedIn)).toBe(true);
  });
});
