import { afterEach, describe, expect, it } from "vitest";

import {
  AUTH_SIGNUP_RATE_LIMIT,
  assertSignupRateLimit,
  consumeUnsubscribeRateLimit,
  getClientIpFromRequest,
  resetPublicRouteRateLimitStoreForTests,
} from "@/server/security/public-route-rate-limit";
import { AppError } from "@/server/errors";

describe("public-route-rate-limit", () => {
  afterEach(() => {
    resetPublicRouteRateLimitStoreForTests();
  });

  it("extracts client ip from x-forwarded-for", () => {
    const request = new Request("https://example.com/api/auth/signup", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    });
    expect(getClientIpFromRequest(request)).toBe("203.0.113.10");
  });

  it("rate limits signup bursts", () => {
    for (let i = 0; i < AUTH_SIGNUP_RATE_LIMIT.maxRequests; i += 1) {
      expect(() => assertSignupRateLimit("1.2.3.4")).not.toThrow();
    }
    try {
      assertSignupRateLimit("1.2.3.4");
      throw new Error("expected rate limit");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("RATE_LIMITED");
    }
  });

  it("rate limits unsubscribe processing by ip", () => {
    for (let i = 0; i < 60; i += 1) {
      expect(consumeUnsubscribeRateLimit("9.9.9.9")).toBe(true);
    }
    expect(consumeUnsubscribeRateLimit("9.9.9.9")).toBe(false);
  });
});
