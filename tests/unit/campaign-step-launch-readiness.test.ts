import { describe, expect, it } from "vitest";

import {
  getCampaignStepLaunchIssues,
  isCampaignStepLaunchReady,
} from "@/lib/campaign-step-readiness";

const baseStep = {
  status: "ready",
  subject: "Hello",
  contentMode: "plain_text",
  body: "Thanks for joining.\n{unsubscribe_url}",
  bodyHtml: null,
  bodyText: "Thanks for joining.\n{unsubscribe_url}",
};

describe("campaign step launch readiness", () => {
  it("accepts a complete ready step", () => {
    expect(getCampaignStepLaunchIssues(baseStep)).toEqual([]);
    expect(isCampaignStepLaunchReady(baseStep)).toBe(true);
  });

  it("rejects ready steps missing unsubscribe support", () => {
    const step = {
      ...baseStep,
      body: "Thanks for joining.",
      bodyText: "Thanks for joining.",
    };

    expect(getCampaignStepLaunchIssues(step)).toEqual([
      "Include {unsubscribe_url} or an unsubscribe link before marking this email as ready.",
    ]);
    expect(isCampaignStepLaunchReady(step)).toBe(false);
  });

  it("treats draft steps as not launch-ready", () => {
    expect(isCampaignStepLaunchReady({ ...baseStep, status: "draft" })).toBe(false);
  });
});
