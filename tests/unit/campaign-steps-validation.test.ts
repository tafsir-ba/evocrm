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

  it("accepts newsletter-shaped create payload with channel", () => {
    const result = createCampaignStepInputSchema.safeParse({
      order: 1,
      delayDays: 0,
      delayAmount: 0,
      delayUnit: "days",
      sendTime: "09:00",
      fromName: "Evo Home",
      channel: "email",
      status: "ready",
      contentMode: "html",
      subject: "Spring update",
      previewText: null,
      body: "Hello",
      bodyHtml: "<p>Hello</p>",
      bodyText: "Hello",
    });

    expect(result.success).toBe(true);
  });

  it("rejects newsletter-shaped update payload that includes channel (strict)", () => {
    const newsletterStepUpdate = {
      order: 1,
      delayDays: 0,
      delayAmount: 0,
      delayUnit: "days",
      sendTime: "09:00",
      fromName: "Evo Home",
      channel: "email",
      status: "ready",
      contentMode: "html",
      subject: "Spring update",
      previewText: null,
      body: "Hello",
      bodyHtml: "<p>Hello</p>",
      bodyText: "Hello",
    };

    const withChannel = updateCampaignStepInputSchema.safeParse(newsletterStepUpdate);
    expect(withChannel.success).toBe(false);
    if (!withChannel.success) {
      const root = withChannel.error.flatten().formErrors.join(" ");
      expect(root).toMatch(/Unrecognized key\(s\).*channel/i);
    }

    const { channel: _channel, ...withoutChannel } = newsletterStepUpdate;
    const clean = updateCampaignStepInputSchema.safeParse(withoutChannel);
    expect(clean.success).toBe(true);
  });

  it("rejects empty name on update payloads", () => {
    const result = updateCampaignStepInputSchema.safeParse({ name: "" });

    expect(result.success).toBe(false);
  });

  it("accepts null name on update payloads", () => {
    const result = updateCampaignStepInputSchema.safeParse({ name: null, status: "draft" });

    expect(result.success).toBe(true);
  });

  it("accepts send time with seconds by normalizing to HH:mm", () => {
    const result = updateCampaignStepInputSchema.safeParse({ sendTime: "15:59:00" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sendTime).toBe("15:59");
    }
  });

  it("accepts HH:mm send time", () => {
    const result = updateCampaignStepInputSchema.safeParse({ sendTime: "15:59" });

    expect(result.success).toBe(true);
  });
});
