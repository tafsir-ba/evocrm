import { describe, expect, it } from "vitest";

import {
  generateIntegrationApiKey,
  hashIntegrationApiKey,
  parseIntegrationApiKeyFromRequest,
  verifyIntegrationApiKey,
} from "@/server/services/integration-api-keys";

describe("integration API keys", () => {
  it("generates prefixed raw keys and stores only hashes", () => {
    const rawKey = generateIntegrationApiKey();

    expect(rawKey.startsWith("evocrm_whk_")).toBe(true);

    const hash = hashIntegrationApiKey(rawKey);

    expect(hash).not.toBe(rawKey);
    expect(hash.length).toBeGreaterThan(20);
  });

  it("verifies matching keys with timing-safe comparison", () => {
    const rawKey = generateIntegrationApiKey();
    const hash = hashIntegrationApiKey(rawKey);

    expect(verifyIntegrationApiKey(rawKey, hash)).toBe(true);
    expect(verifyIntegrationApiKey(`${rawKey}x`, hash)).toBe(false);
  });

  it("parses bearer and fallback header values", () => {
    const bearerRequest = new Request("http://localhost/api/integrations/website/leads", {
      headers: { Authorization: "Bearer test-key-123" },
    });
    const headerRequest = new Request("http://localhost/api/integrations/website/leads", {
      headers: { "X-Integration-Key": "test-key-456" },
    });

    expect(parseIntegrationApiKeyFromRequest(bearerRequest)).toBe("test-key-123");
    expect(parseIntegrationApiKeyFromRequest(headerRequest)).toBe("test-key-456");
  });
});
