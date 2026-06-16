import { describe, expect, it } from "vitest";

import type { CampaignStepRecord } from "@/server/repositories/campaign-steps";
import { assertCampaignStepReady } from "@/server/utils/campaign-step-readiness";

function baseStep(overrides: Partial<CampaignStepRecord> = {}): CampaignStepRecord {
  return {
    id: "step-1",
    workspaceId: "ws-1",
    campaignId: "campaign-1",
    order: 1,
    name: "Email 1",
    delayDays: 0,
    delayAmount: 0,
    delayUnit: "days",
    sendTime: "09:00",
    fromName: "EvoHome",
    channel: "email",
    status: "draft",
    contentMode: "plain_text",
    subject: "Hello",
    previewText: null,
    body: "Thanks for joining.\n{unsubscribe_url}",
    bodyHtml: null,
    bodyText: "Thanks for joining.\n{unsubscribe_url}",
    documentIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("campaign step readiness", () => {
  it("accepts a complete plain-text step", () => {
    expect(() => assertCampaignStepReady(baseStep())).not.toThrow();
  });

  it("requires an unsubscribe link before marking ready", () => {
    expect(() =>
      assertCampaignStepReady(
        baseStep({
          body: "Thanks for joining.",
          bodyText: "Thanks for joining.",
        }),
      ),
    ).toThrowError(/unsubscribe/i);
  });
});
