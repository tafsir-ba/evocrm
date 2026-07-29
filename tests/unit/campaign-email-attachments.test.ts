import { describe, expect, it } from "vitest";

import {
  MAX_CAMPAIGN_EMAIL_ATTACHMENT_BYTES,
  MAX_CAMPAIGN_EMAIL_ATTACHMENTS,
} from "@/lib/campaign-email-attachments";

describe("campaign email attachment limits", () => {
  it("keeps attachment caps within ESP-friendly bounds", () => {
    expect(MAX_CAMPAIGN_EMAIL_ATTACHMENTS).toBe(10);
    expect(MAX_CAMPAIGN_EMAIL_ATTACHMENT_BYTES).toBe(20 * 1024 * 1024);
  });
});
