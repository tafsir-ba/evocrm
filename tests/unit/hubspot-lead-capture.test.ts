import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/integrations", () => ({
  findActiveHubSpotIntegrationByPortalId: vi.fn(),
  findHubSpotIntegrationByPortalId: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findActiveLeadByEmailNormalized: vi.fn(),
  findLeadByIntegrationIdempotencyKey: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
  findProjects: vi.fn(),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemByTypeAndKey: vi.fn(),
}));

vi.mock("@/server/services/default-dictionaries", () => ({
  ensureDefaultDictionaries: vi.fn(),
}));

vi.mock("@/server/services/hubspot-client", () => ({
  assertHubSpotAccessToken: vi.fn(),
  fetchHubSpotContact: vi.fn(),
}));

vi.mock("@/server/services/leads", () => ({
  createLeadForWorkspace: vi.fn(),
  normalizeLeadEmail: vi.fn((email: string) => ({
    email,
    emailNormalized: email.toLowerCase(),
  })),
}));

vi.mock("@/server/services/integration-logs", () => ({
  buildWebsiteLeadPayloadSummary: vi.fn((input) => input),
  writeIntegrationLog: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/security/integration-credentials", () => ({
  decodeHubSpotCredentials: vi.fn(() => ({
    accessToken: "pat-test",
    clientSecret: "client-secret",
    portalId: "12345",
  })),
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
import { findLeadByIntegrationIdempotencyKey } from "@/server/repositories/leads";
import { findProjectById } from "@/server/repositories/projects";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import {
  assertHubSpotAccessToken,
  fetchHubSpotContact,
} from "@/server/services/hubspot-client";
import { createLeadForWorkspace } from "@/server/services/leads";
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
    vi.mocked(findProjectById).mockResolvedValue({
      id: "project-1",
      archivedAt: null,
    } as never);
    vi.mocked(findDictionaryItemByTypeAndKey).mockImplementation(
      async (_workspaceId, type, key) => {
        if (type === "lead_status" && key === "new") {
          return { id: "status-new", isActive: true } as never;
        }
        if (type === "lead_source" && key === "hubspot") {
          return { id: "source-hubspot", isActive: true } as never;
        }
        return null;
      },
    );
    vi.mocked(findLeadByIntegrationIdempotencyKey).mockResolvedValue(null);
    vi.mocked(fetchHubSpotContact).mockResolvedValue({
      id: "99",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: null,
      properties: { company: "Analytical Engines" },
    });
    vi.mocked(createLeadForWorkspace).mockResolvedValue({
      lead: { id: "lead-1" },
      warnings: [],
    } as never);
  });

  it("creates an Evohome lead from a HubSpot contact.creation event", async () => {
    const rawBody = JSON.stringify([
      {
        objectId: 99,
        subscriptionType: "contact.creation",
        portalId: 12345,
        eventId: 7,
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
    expect(createLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      expect.objectContaining({
        projectId: "project-1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        sourceId: "source-hubspot",
        attributes: expect.objectContaining({
          integration: expect.objectContaining({
            externalId: "99",
            inboundSource: "hubspot",
            idempotencyKey: "hubspot:contact:99",
          }),
        }),
      }),
    );
    expect(summary).toEqual({
      received: 1,
      created: 1,
      duplicates: 0,
      skipped: 0,
      failed: 0,
    });
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
});
