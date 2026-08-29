import { afterEach, describe, expect, it } from "vitest";

import {
  assertHubSpotWebhookRateLimit,
  HUBSPOT_WEBHOOK_RATE_LIMIT,
  resetHubSpotWebhookRateLimitStoreForTests,
} from "@/server/security/hubspot-webhook-rate-limit";
import {
  assertHubSpotWebhookContentLength,
  assertHubSpotWebhookRawBodySize,
  MAX_HUBSPOT_WEBHOOK_REQUEST_BYTES,
} from "@/server/security/hubspot-webhook-request-guards";

describe("assertHubSpotWebhookContentLength", () => {
  it("allows missing Content-Length", () => {
    expect(() =>
      assertHubSpotWebhookContentLength(new Request("https://example.com", { method: "POST" })),
    ).not.toThrow();
  });

  it("rejects bodies larger than the max via Content-Length", () => {
    expect(() =>
      assertHubSpotWebhookContentLength(
        new Request("https://example.com", {
          method: "POST",
          headers: {
            "content-length": String(MAX_HUBSPOT_WEBHOOK_REQUEST_BYTES + 1),
          },
        }),
      ),
    ).toThrow(/too large/i);
  });

  it("rejects oversized raw bodies after read", () => {
    const oversized = "x".repeat(MAX_HUBSPOT_WEBHOOK_REQUEST_BYTES + 1);
    expect(() => assertHubSpotWebhookRawBodySize(oversized)).toThrow(/too large/i);
  });
});

describe("assertHubSpotWebhookRateLimit", () => {
  afterEach(() => {
    resetHubSpotWebhookRateLimitStoreForTests();
  });

  it("throws RATE_LIMITED after the IP window is exceeded", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.10" },
    });

    for (let index = 0; index < HUBSPOT_WEBHOOK_RATE_LIMIT.maxRequests; index += 1) {
      await assertHubSpotWebhookRateLimit(request);
    }

    await expect(assertHubSpotWebhookRateLimit(request)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});
