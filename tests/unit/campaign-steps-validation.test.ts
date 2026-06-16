import { describe, expect, it } from "vitest";

import {
  createCampaignStepInputSchema,
  updateCampaignStepInputSchema,
} from "@/server/validation/campaign-steps";

describe("campaign step validation", () => {
  it("accepts channel on create payloads", () => {
    const result = createCampaignStepInputSchema.safeParse({
      order: 1,
      delayDays: 0,
      sendTime: "09:00",
      channel: "email",
      subject: "Hello",
      body: "Body copy",
    });

    expect(result.success).toBe(true);
  });

  it("rejects channel on update payloads", () => {
    const result = updateCampaignStepInputSchema.safeParse({
      channel: "email",
      subject: "Hello",
      body: "Body copy",
      status: "draft",
    });

    expect(result.success).toBe(false);
  });

  it("accepts update payloads without channel", () => {
    const result = updateCampaignStepInputSchema.safeParse({
      subject: "Hello",
      body: "Body copy",
      status: "draft",
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty name on update payloads", () => {
    const result = updateCampaignStepInputSchema.safeParse({ name: "" });

    expect(result.success).toBe(false);
  });

  it("accepts null name on update payloads", () => {
    const result = updateCampaignStepInputSchema.safeParse({ name: null, status: "draft" });

    expect(result.success).toBe(true);
  });
});
