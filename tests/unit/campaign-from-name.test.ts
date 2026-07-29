import { describe, expect, it } from "vitest";

import {
  campaignHasSenderContactName,
  resolveCampaignStepFromName,
} from "@/lib/campaign-from-name";

describe("resolveCampaignStepFromName", () => {
  const campaign = {
    senderName: "Grosvenor",
    defaultFromName: "Project X",
    name: "Grosvenor Vistas website contact form dripping",
  };

  it("uses the step from name when present and distinct from the campaign title", () => {
    expect(resolveCampaignStepFromName("Step Sender", campaign)).toBe("Step Sender");
  });

  it("falls back to campaign sender name before default from name", () => {
    expect(resolveCampaignStepFromName("  ", campaign)).toBe("Grosvenor");
  });

  it("ignores a legacy step from name that was baked as the campaign title", () => {
    expect(
      resolveCampaignStepFromName("Grosvenor Vistas website contact form dripping", campaign),
    ).toBe("Grosvenor");
  });

  it("falls back to campaign default from name", () => {
    expect(
      resolveCampaignStepFromName("", {
        senderName: null,
        defaultFromName: "Project X",
        name: "Buyer Follow-up",
      }),
    ).toBe("Project X");
  });

  it("does not use the campaign title when sender settings are empty", () => {
    expect(
      resolveCampaignStepFromName("", {
        defaultFromName: null,
        name: "Buyer Follow-up",
      }),
    ).toBe("");
    expect(
      resolveCampaignStepFromName("Buyer Follow-up", {
        senderName: null,
        defaultFromName: null,
        name: "Buyer Follow-up",
      }),
    ).toBe("");
  });
});

describe("campaignHasSenderContactName", () => {
  it("requires an explicit sender or default from name", () => {
    expect(campaignHasSenderContactName({ senderName: "Grosvenor", defaultFromName: null })).toBe(
      true,
    );
    expect(
      campaignHasSenderContactName({ senderName: null, defaultFromName: "Grosvenor" }),
    ).toBe(true);
    expect(campaignHasSenderContactName({ senderName: "  ", defaultFromName: null })).toBe(false);
    expect(campaignHasSenderContactName({ senderName: null, defaultFromName: null })).toBe(false);
  });
});
