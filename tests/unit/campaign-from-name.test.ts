import { describe, expect, it } from "vitest";

import { resolveCampaignStepFromName } from "@/server/utils/campaign-from-name";

describe("resolveCampaignStepFromName", () => {
  const campaign = {
    defaultFromName: "Project X",
    name: "Buyer Follow-up",
  };

  it("uses the step from name when present", () => {
    expect(resolveCampaignStepFromName("Step Sender", campaign)).toBe("Step Sender");
  });

  it("falls back to campaign default from name", () => {
    expect(resolveCampaignStepFromName("  ", campaign)).toBe("Project X");
  });

  it("falls back to campaign name when default is empty", () => {
    expect(
      resolveCampaignStepFromName("", {
        defaultFromName: null,
        name: "Buyer Follow-up",
      }),
    ).toBe("Buyer Follow-up");
  });
});
