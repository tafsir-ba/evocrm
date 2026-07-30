import { describe, expect, it } from "vitest";

import {
  clampCampaignSendBatchLimit,
  DEFAULT_CAMPAIGN_SEND_BATCH_LIMIT,
  MAX_CAMPAIGN_SEND_BATCH_LIMIT,
} from "@/lib/campaign-send-limits";
import { buildCampaignListUnsubscribeHeaders } from "@/lib/campaign-unsubscribe-headers";

describe("campaign send batch limits", () => {
  it("defaults and clamps batch sizes", () => {
    expect(clampCampaignSendBatchLimit()).toBe(DEFAULT_CAMPAIGN_SEND_BATCH_LIMIT);
    expect(clampCampaignSendBatchLimit(Number.NaN)).toBe(DEFAULT_CAMPAIGN_SEND_BATCH_LIMIT);
    expect(clampCampaignSendBatchLimit(0)).toBe(DEFAULT_CAMPAIGN_SEND_BATCH_LIMIT);
    expect(clampCampaignSendBatchLimit(25)).toBe(25);
    expect(clampCampaignSendBatchLimit(999)).toBe(MAX_CAMPAIGN_SEND_BATCH_LIMIT);
  });
});

describe("campaign list-unsubscribe headers", () => {
  it("builds RFC 8058 one-click headers", () => {
    expect(
      buildCampaignListUnsubscribeHeaders(
        "https://crm.example.com/api/unsubscribe?token=abc",
      ),
    ).toEqual({
      "List-Unsubscribe": "<https://crm.example.com/api/unsubscribe?token=abc>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});
