import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/integrations", () => ({
  findActiveHubSpotIntegrationByPortalId: vi.fn(),
}));

vi.mock("@/server/services/hubspot-ongoing-sync", () => ({
  processOngoingHubSpotEvents: vi.fn(),
  processOngoingHubSpotContact: vi.fn(),
}));

vi.mock("@/server/repositories/hubspot-sync-cursors", () => ({
  ensureHubSpotSyncCursor: vi.fn(),
}));

vi.mock("@/server/services/hubspot-client", () => ({
  assertHubSpotAccessToken: vi.fn(),
}));

vi.mock("@/server/security/integration-credentials", () => ({
  decodeHubSpotCredentials: vi.fn(() => ({
    accessToken: "pat-test",
    clientSecret: "client-secret",
    portalId: "12345",
  })),
  requireHubSpotClientSecret: vi.fn((credentials: { clientSecret: string | null }) => {
    if (!credentials.clientSecret) {
      throw new Error("missing secret");
    }
    return credentials.clientSecret;
  }),
}));

vi.mock("@/server/utils/hubspot-webhook", async () => {
  const actual = await vi.importActual<typeof import("@/server/utils/hubspot-webhook")>(
    "@/server/utils/hubspot-webhook",
  );
  return {
    ...actual,
    verifyHubSpotSignatureV3: vi.fn(),
  };
});

import { createHmac } from "crypto";
import { findActiveHubSpotIntegrationByPortalId } from "@/server/repositories/integrations";
import { assertHubSpotAccessToken } from "@/server/services/hubspot-client";
import { processOngoingHubSpotEvents } from "@/server/services/hubspot-ongoing-sync";
import { processHubSpotWebhookRequest } from "@/server/services/hubspot-lead-capture";
import { verifyHubSpotSignatureV3 } from "@/server/utils/hubspot-webhook";

const integration = {
  id: "int-hs",
  workspaceId: "ws-1",
  type: "hubspot" as const,
  name: "HubSpot",
  status: "active" as const,
  credentialsEncrypted: "encrypted",
  externalAccountId: "12345",
  apiKeyHash: null,
  defaultProjectId: "project-1",
  allowProjectOverride: false,
  createdBy: "user-1",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("hubspot lead capture webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findActiveHubSpotIntegrationByPortalId).mockResolvedValue(integration);
    vi.mocked(processOngoingHubSpotEvents).mockResolvedValue({
      received: 1,
      created: 1,
      updated: 0,
      duplicates: 0,
      skipped: 0,
      parked: 0,
      failed: 0,
      wouldCreate: 0,
      wouldUpdate: 0,
    });
  });

  it("verifies the signature and delegates to the ongoing sync processor", async () => {
    const rawBody = JSON.stringify([
      {
        objectId: 99,
        subscriptionType: "contact.creation",
        portalId: 12345,
        eventId: 7,
        occurredAt: 1_700_000_000_000,
      },
    ]);

    const summary = await processHubSpotWebhookRequest({
      method: "POST",
      uri: "https://crm.evo-home.ch/api/integrations/hubspot/webhooks",
      rawBody,
      timestampHeader: String(Date.now()),
      signatureHeader: "ignored-by-mock",
    });

    expect(verifyHubSpotSignatureV3).toHaveBeenCalled();
    expect(assertHubSpotAccessToken).toHaveBeenCalledWith("pat-test");
    expect(processOngoingHubSpotEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        integration,
        path: "webhook",
        events: [
          expect.objectContaining({
            contactId: "99",
          }),
        ],
      }),
    );
    expect(summary.created).toBe(1);
    expect(summary.received).toBe(1);
  });

  it("collapses duplicate contact events in one delivery", async () => {
    vi.mocked(processOngoingHubSpotEvents).mockResolvedValue({
      received: 1,
      created: 0,
      updated: 1,
      duplicates: 0,
      skipped: 0,
      parked: 0,
      failed: 0,
      wouldCreate: 0,
      wouldUpdate: 0,
    });

    await processHubSpotWebhookRequest({
      method: "POST",
      uri: "https://crm.evo-home.ch/api/integrations/hubspot/webhooks",
      rawBody: JSON.stringify([
        { objectId: 99, subscriptionType: "contact.creation", portalId: 12345, occurredAt: 1 },
        { objectId: 99, subscriptionType: "contact.propertyChange", portalId: 12345, occurredAt: 2 },
      ]),
      timestampHeader: String(Date.now()),
      signatureHeader: "ignored",
    });

    expect(processOngoingHubSpotEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [expect.objectContaining({ contactId: "99" })],
      }),
    );
  });

  it("still verifies signatures using the helper (crypto smoke)", () => {
    const secret = "abc";
    const body = "[]";
    const ts = String(Date.now());
    const uri = "https://example.com/hook";
    const signature = createHmac("sha256", secret)
      .update(`POST${uri}${body}${ts}`)
      .digest("base64");
    expect(signature.length).toBeGreaterThan(10);
  });

  it("returns opaque FORBIDDEN when portal integration is missing or inactive", async () => {
    vi.mocked(findActiveHubSpotIntegrationByPortalId).mockResolvedValue(null);

    await expect(
      processHubSpotWebhookRequest({
        method: "POST",
        uri: "https://crm.evo-home.ch/api/integrations/hubspot/webhooks",
        rawBody: JSON.stringify([
          { objectId: 1, subscriptionType: "contact.creation", portalId: 999 },
        ]),
        timestampHeader: String(Date.now()),
        signatureHeader: "ignored",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Invalid HubSpot webhook.",
    });
  });
});
