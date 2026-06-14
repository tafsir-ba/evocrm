import { beforeEach, describe, expect, it } from "vitest";

import {
  assertWebsiteLeadRateLimit,
  checkWebsiteLeadRateLimit,
  getWebsiteLeadRateLimitKey,
  resetWebsiteLeadRateLimitStoreForTests,
  WEBSITE_LEAD_RATE_LIMIT,
} from "@/server/security/website-lead-rate-limit";
import { AppError } from "@/server/errors";

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

    const key = getWebsiteLeadRateLimitKey(request, "evocrm_whk_test_key");

    expect(key.startsWith("website-lead:api-key:")).toBe(true);
    expect(key).not.toContain("203.0.113.10");
  });

  it("keys unauthenticated requests by client IP", () => {
    const request = new Request("http://localhost/api/integrations/website/leads", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    });

    const key = getWebsiteLeadRateLimitKey(request, null);

    expect(key).toBe("website-lead:ip:203.0.113.10");
  });

  it("allows requests within the configured window", () => {
    const key = "website-lead:ip:test";

    for (let index = 0; index < WEBSITE_LEAD_RATE_LIMIT.maxRequests; index += 1) {
      expect(checkWebsiteLeadRateLimit(key).allowed).toBe(true);
    }
  });

  it("blocks requests above the configured window", () => {
    const key = "website-lead:ip:test";

    for (let index = 0; index < WEBSITE_LEAD_RATE_LIMIT.maxRequests; index += 1) {
      checkWebsiteLeadRateLimit(key);
    }

    const blocked = checkWebsiteLeadRateLimit(key);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("throws RATE_LIMITED when assertWebsiteLeadRateLimit is exceeded", () => {
    const request = new Request("http://localhost/api/integrations/website/leads", {
      headers: { "x-forwarded-for": "203.0.113.99" },
    });

    for (let index = 0; index < WEBSITE_LEAD_RATE_LIMIT.maxRequests; index += 1) {
      assertWebsiteLeadRateLimit(request, null);
    }

    expect(() => assertWebsiteLeadRateLimit(request, null)).toThrow(AppError);

    try {
      assertWebsiteLeadRateLimit(request, null);
    } catch (error) {
      expect(error).toMatchObject({ code: "RATE_LIMITED" });
    }
  });
});
