import { beforeEach, describe, expect, it } from "vitest";

import {
  assertFeedbackRateLimit,
  assertFeedbackRateLimitPreflight,
  checkFeedbackRateLimit,
  peekFeedbackRateLimit,
  resetFeedbackRateLimitStoreForTests,
} from "@/server/security/feedback-rate-limit";
import { FEEDBACK_RATE_LIMIT } from "@/server/feedback/constants";

describe("feedback rate limit", () => {
  beforeEach(() => {
    resetFeedbackRateLimitStoreForTests();
  });

  it("allows submissions up to the hourly cap", () => {
    for (let index = 0; index < FEEDBACK_RATE_LIMIT.maxRequests; index += 1) {
      expect(checkFeedbackRateLimit("user-1").allowed).toBe(true);
    }
  });

  it("throws RATE_LIMITED on the 11th submission in the window", () => {
    for (let index = 0; index < FEEDBACK_RATE_LIMIT.maxRequests; index += 1) {
      checkFeedbackRateLimit("user-1");
    }

    expect(() => assertFeedbackRateLimit("user-1")).toThrowError(
      expect.objectContaining({ code: "RATE_LIMITED" }),
    );
  });

  it("preflight rejects without incrementing when the cap is already reached", () => {
    for (let index = 0; index < FEEDBACK_RATE_LIMIT.maxRequests; index += 1) {
      checkFeedbackRateLimit("user-1");
    }

    expect(peekFeedbackRateLimit("user-1").allowed).toBe(false);
    expect(() => assertFeedbackRateLimitPreflight("user-1")).toThrowError(
      expect.objectContaining({ code: "RATE_LIMITED" }),
    );
    expect(peekFeedbackRateLimit("user-1").allowed).toBe(false);
  });
});
