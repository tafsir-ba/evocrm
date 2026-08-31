import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  encryptIntegrationCredentials,
  decryptIntegrationCredentials,
  encodeHubSpotCredentials,
  decodeHubSpotCredentials,
  requireHubSpotClientSecret,
} from "@/server/security/integration-credentials";
import {
  collapseHubSpotEventsByContact,
  isHubSpotContactCreationEvent,
  isHubSpotOngoingSyncEvent,
  parseHubSpotWebhookEvents,
  verifyHubSpotSignatureV3,
} from "@/server/utils/hubspot-webhook";
import { AppError } from "@/server/errors";

vi.mock("@/server/env", () => ({
  getEnv: vi.fn(() => ({
    NEXTAUTH_SECRET: "test-nextauth-secret-for-credentials",
    INTEGRATION_API_KEY_PEPPER: undefined,
  })),
}));

describe("integration credentials encryption", () => {
  it("round-trips plaintext credentials", () => {
    const encrypted = encryptIntegrationCredentials("super-secret");
    expect(encrypted.startsWith("evocrm_cred_v1.")).toBe(true);
    expect(decryptIntegrationCredentials(encrypted)).toBe("super-secret");
  });

  it("round-trips HubSpot credential payloads", () => {
    const encoded = encodeHubSpotCredentials({
      accessToken: "pat-abc",
      clientSecret: "secret-xyz",
      portalId: "12345",
    });
    expect(decodeHubSpotCredentials(encoded)).toEqual({
      accessToken: "pat-abc",
      clientSecret: "secret-xyz",
      portalId: "12345",
    });
  });

  it("allows token-only HubSpot credentials without client secret", () => {
    const encoded = encodeHubSpotCredentials({
      accessToken: "pat-abc",
      clientSecret: null,
      portalId: "12345",
    });
    expect(decodeHubSpotCredentials(encoded)).toEqual({
      accessToken: "pat-abc",
      clientSecret: null,
      portalId: "12345",
    });
  });

  it("requires a client secret before webhook signature verification", () => {
    expect(() =>
      requireHubSpotClientSecret({
        accessToken: "pat-abc",
        clientSecret: null,
        portalId: "12345",
      }),
    ).toThrow(AppError);

    expect(
      requireHubSpotClientSecret({
        accessToken: "pat-abc",
        clientSecret: "secret-xyz",
        portalId: "12345",
      }),
    ).toBe("secret-xyz");
  });
});

describe("hubspot webhook helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses contact creation events", () => {
    const events = parseHubSpotWebhookEvents([
      {
        objectId: 99,
        subscriptionType: "contact.creation",
        portalId: 12345,
        eventId: 1,
      },
      {
        objectId: 100,
        subscriptionType: "contact.propertyChange",
        portalId: 12345,
      },
    ]);

    expect(events).toHaveLength(2);
    expect(isHubSpotContactCreationEvent(events[0])).toBe(true);
    expect(isHubSpotContactCreationEvent(events[1])).toBe(false);
    expect(isHubSpotOngoingSyncEvent(events[1])).toBe(true);
    expect(collapseHubSpotEventsByContact(events)).toHaveLength(2);
    expect(
      collapseHubSpotEventsByContact([
        { objectId: 99, subscriptionType: "contact.creation", occurredAt: 1 },
        { objectId: 99, subscriptionType: "contact.propertyChange", occurredAt: 5 },
      ]),
    ).toEqual([
      expect.objectContaining({
        objectId: 99,
        subscriptionType: "contact.propertyChange",
        occurredAt: 5,
      }),
    ]);
  });

  it("verifies HubSpot signature v3", () => {
    const clientSecret = "hubspot-client-secret";
    const method = "POST";
    const uri = "https://crm.evo-home.ch/api/integrations/hubspot/webhooks";
    const rawBody = JSON.stringify([{ objectId: 1, portalId: 9 }]);
    const timestamp = String(Date.now());
    const source = `${method}${uri}${rawBody}${timestamp}`;
    const signature = createHmac("sha256", clientSecret).update(source).digest("base64");

    expect(() =>
      verifyHubSpotSignatureV3({
        method,
        uri,
        rawBody,
        timestampHeader: timestamp,
        signatureHeader: signature,
        clientSecret,
      }),
    ).not.toThrow();
  });

  it("rejects invalid HubSpot signatures", () => {
    expect(() =>
      verifyHubSpotSignatureV3({
        method: "POST",
        uri: "https://example.com/hook",
        rawBody: "[]",
        timestampHeader: String(Date.now()),
        signatureHeader: "bad",
        clientSecret: "secret",
      }),
    ).toThrow(AppError);
  });

  it("rejects timestamps outside the allowed skew with an opaque signature error", () => {
    const now = Date.now();

    try {
      verifyHubSpotSignatureV3({
        method: "POST",
        uri: "https://example.com/hook",
        rawBody: "[]",
        timestampHeader: String(now - 10 * 60 * 1000),
        signatureHeader: "unused",
        clientSecret: "secret",
        now,
      });
      throw new Error("expected verifyHubSpotSignatureV3 to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        code: "FORBIDDEN",
        message: "Invalid HubSpot webhook signature.",
      });
    }
  });
});
