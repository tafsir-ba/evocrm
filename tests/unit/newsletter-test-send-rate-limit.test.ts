import { afterEach, describe, expect, it } from "vitest";

import { AppError } from "@/server/errors";
import {
  NEWSLETTER_TEST_SEND_RATE_LIMIT,
  assertNewsletterTestSendRateLimit,
  resetNewsletterTestSendRateLimitStoreForTests,
} from "@/server/security/newsletter-test-send-rate-limit";

describe("newsletter test-send rate limit", () => {
  afterEach(() => {
    resetNewsletterTestSendRateLimitStoreForTests();
  });

  it("allows requests under the request and recipient caps", () => {
    expect(() =>
      assertNewsletterTestSendRateLimit("ws-1", "user-1", 10),
    ).not.toThrow();
    expect(() =>
      assertNewsletterTestSendRateLimit("ws-1", "user-1", 10),
    ).not.toThrow();
  });

  it("rejects when request count exceeds the window cap", () => {
    for (let i = 0; i < NEWSLETTER_TEST_SEND_RATE_LIMIT.maxRequests; i += 1) {
      assertNewsletterTestSendRateLimit("ws-1", "user-1", 1);
    }

    expect(() => assertNewsletterTestSendRateLimit("ws-1", "user-1", 1)).toThrow(
      AppError,
    );

    try {
      assertNewsletterTestSendRateLimit("ws-1", "user-1", 1);
    } catch (error) {
      expect(error).toMatchObject({
        code: "RATE_LIMITED",
        message: expect.stringMatching(/too many newsletter test/i),
      });
    }
  });

  it("rejects when recipient count would exceed the window cap", () => {
    assertNewsletterTestSendRateLimit("ws-1", "user-1", 25);

    expect(() => assertNewsletterTestSendRateLimit("ws-1", "user-1", 10)).toThrow(
      AppError,
    );
  });

  it("scopes limits per workspace and actor", () => {
    for (let i = 0; i < NEWSLETTER_TEST_SEND_RATE_LIMIT.maxRequests; i += 1) {
      assertNewsletterTestSendRateLimit("ws-1", "user-1", 1);
    }

    expect(() =>
      assertNewsletterTestSendRateLimit("ws-1", "user-2", 1),
    ).not.toThrow();
    expect(() =>
      assertNewsletterTestSendRateLimit("ws-2", "user-1", 1),
    ).not.toThrow();
  });
});
