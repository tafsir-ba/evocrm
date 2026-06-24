import { beforeEach, describe, expect, it } from "vitest";

import {
  assertWebsiteLeadRateLimit,
  checkWebsiteLeadRateLimit,
  getWebsiteLeadApiKeyRateLimitKey,
  getWebsiteLeadIpRateLimitKey,
  getWebsiteLeadRateLimitKey,
  resetWebsiteLeadRateLimitStoreForTests,
  WEBSITE_LEAD_RATE_LIMIT,
} from "@/server/security/website-lead-rate-limit";

describe("website lead rate limit", () => {
  beforeEach(() => {
    resetWebsiteLeadRateLimitStoreForTests();
  });

  it("keys authenticated requests by API key hash", () => {
    const request = new Request("http://localhost/api/integrations/website/leads", {
      headers: {
        Authorization: "Bearer evocrm_whk_test_key",
        "x-forwarded-for": "203.0.113.10",
      },
    });

    const key = getWebsiteLeadApiKeyRateLimitKey("evocrm_whk_test_key");

    expect(key.startsWith("website-lead:api-key:")).toBe(true);
    expect(key).not.toContain("203.0.113.10");
    expect(getWebsiteLeadIpRateLimitKey(request)).toBe("website-lead:ip:203.0.113.10");
  });

  it("keys unauthenticated requests by client IP", () => {
    const request = new Request("http://localhost/api/integrations/website/leads", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    });

    const key = getWebsiteLeadIpRateLimitKey(request);

    expect(key).toBe("website-lead:ip:203.0.113.10");
    expect(getWebsiteLeadRateLimitKey(request, null)).toBe(key);
  });

  it("allows requests within the configured window", async () => {
    const key = "website-lead:ip:test";

    for (let index = 0; index < WEBSITE_LEAD_RATE_LIMIT.maxRequests; index += 1) {
      expect((await checkWebsiteLeadRateLimit(key)).allowed).toBe(true);
    }
  });

  it("blocks requests above the configured window", async () => {
    const key = "website-lead:ip:test";

    for (let index = 0; index < WEBSITE_LEAD_RATE_LIMIT.maxRequests; index += 1) {
      await checkWebsiteLeadRateLimit(key);
    }

    const blocked = await checkWebsiteLeadRateLimit(key);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("throws RATE_LIMITED when assertWebsiteLeadRateLimit is exceeded", async () => {
    const request = new Request("http://localhost/api/integrations/website/leads", {
      headers: { "x-forwarded-for": "203.0.113.99" },
    });

    for (let index = 0; index < WEBSITE_LEAD_RATE_LIMIT.maxRequests; index += 1) {
      await assertWebsiteLeadRateLimit(request, null);
    }

    await expect(assertWebsiteLeadRateLimit(request, null)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("rate limits rotating fake API keys by shared client IP", async () => {
    const request = new Request("http://localhost/api/integrations/website/leads", {
      headers: { "x-forwarded-for": "203.0.113.77" },
    });

    for (let index = 0; index < WEBSITE_LEAD_RATE_LIMIT.maxRequests; index += 1) {
      await assertWebsiteLeadRateLimit(request, `evocrm_whk_fake_${index}`);
    }

    await expect(
      assertWebsiteLeadRateLimit(request, "evocrm_whk_fake_rotated"),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});
