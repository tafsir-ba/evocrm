import { describe, expect, it } from "vitest";

import {
  evaluateCampaignDeliveryHealth,
  parseCampaignAnalyticsPeriod,
  ratePercent,
  CAMPAIGN_ANALYTICS_THRESHOLDS,
} from "@/lib/campaign-analytics";

describe("campaign analytics formulas", () => {
  it("computes rates with correct denominators and null when empty", () => {
    expect(ratePercent(98, 100)).toBe(98);
    expect(ratePercent(1, 3)).toBe(33.3);
    expect(ratePercent(0, 0)).toBeNull();
  });

  it("parses period presets with 30d fallback", () => {
    expect(parseCampaignAnalyticsPeriod("7d")).toBe("7d");
    expect(parseCampaignAnalyticsPeriod("all")).toBe("all");
    expect(parseCampaignAnalyticsPeriod("nope")).toBe("30d");
    expect(parseCampaignAnalyticsPeriod(null)).toBe("30d");
  });

  it("marks insufficient data below sample size", () => {
    const result = evaluateCampaignDeliveryHealth({
      sent: CAMPAIGN_ANALYTICS_THRESHOLDS.minSampleSize - 1,
      delivered: 10,
      bounced: 0,
      complained: 0,
      failed: 0,
    });

    expect(result.status).toBe("insufficient_data");
  });

  it("flags critical bounce rate", () => {
    const result = evaluateCampaignDeliveryHealth({
      sent: 100,
      delivered: 90,
      bounced: 10,
      complained: 0,
      failed: 0,
    });

    expect(result.status).toBe("critical");
    expect(result.reasons.some((reason) => /bounce/i.test(reason))).toBe(true);
  });

  it("stays healthy with strong delivery and no complaints", () => {
    const result = evaluateCampaignDeliveryHealth({
      sent: 100,
      delivered: 99,
      bounced: 1,
      complained: 0,
      failed: 0,
    });

    expect(result.status).toBe("healthy");
  });

  it("aligns card threshold units with health ratios", () => {
    expect(CAMPAIGN_ANALYTICS_THRESHOLDS.deliveryNeedsAttention * 100).toBe(95);
    expect(CAMPAIGN_ANALYTICS_THRESHOLDS.deliveryCritical * 100).toBe(90);
    expect(CAMPAIGN_ANALYTICS_THRESHOLDS.bounceNeedsAttention * 100).toBe(2);
    expect(CAMPAIGN_ANALYTICS_THRESHOLDS.bounceCritical * 100).toBe(5);
    expect(CAMPAIGN_ANALYTICS_THRESHOLDS.complaintCritical * 100).toBe(0.1);
  });
});
