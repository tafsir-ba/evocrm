import { describe, expect, it } from "vitest";

import {
  emailBodyHasUnsubscribe,
  isValidCampaignSendTime,
  normalizeCampaignSendTime,
} from "@/lib/campaign-email";

describe("campaign email helpers", () => {
  it("normalizes send time to HH:mm", () => {
    expect(normalizeCampaignSendTime("15:59:00")).toBe("15:59");
    expect(normalizeCampaignSendTime(" 09:00 ")).toBe("09:00");
  });

  it("validates normalized send time", () => {
    expect(isValidCampaignSendTime("15:59:00")).toBe(true);
    expect(isValidCampaignSendTime("25:00")).toBe(false);
  });

  it("detects unsubscribe content", () => {
    expect(emailBodyHasUnsubscribe("Thanks\n{unsubscribe_url}")).toBe(true);
    expect(emailBodyHasUnsubscribe("Click unsubscribe here")).toBe(true);
    expect(emailBodyHasUnsubscribe("test{{first_name}}")).toBe(false);
  });
});
