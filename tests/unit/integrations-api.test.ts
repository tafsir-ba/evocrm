import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/server/workspaces/resolve-workspace", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@/server/permissions/require-permission", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/server/services/integrations", () => ({
  listIntegrationsForWorkspace: vi.fn(),
  createIntegrationForWorkspace: vi.fn(),
  archiveIntegrationForWorkspace: vi.fn(),
  rotateIntegrationApiKeyForWorkspace: vi.fn(),
  listIntegrationLogsForWorkspace: vi.fn(),
}));

vi.mock("@/server/services/website-lead-capture", () => ({
  captureWebsiteLeadFromRequest: vi.fn(),
}));

import {
  DELETE as deleteIntegration,
} from "@/app/api/workspaces/[workspaceSlug]/integrations/[integrationId]/route";
import { POST as rotateApiKey } from "@/app/api/workspaces/[workspaceSlug]/integrations/[integrationId]/rotate-api-key/route";
import { GET as getLogs } from "@/app/api/workspaces/[workspaceSlug]/integrations/[integrationId]/logs/route";
import {
  GET as listIntegrations,
  POST as createIntegration,
} from "@/app/api/workspaces/[workspaceSlug]/integrations/route";
import { POST as captureWebsiteLead } from "@/app/api/integrations/website/leads/route";
import { requireAuth } from "@/server/auth/require-auth";
import { requirePermission } from "@/server/permissions/require-permission";
import {
  archiveIntegrationForWorkspace,
  createIntegrationForWorkspace,
  listIntegrationLogsForWorkspace,
  listIntegrationsForWorkspace,
  rotateIntegrationApiKeyForWorkspace,
} from "@/server/services/integrations";
import { captureWebsiteLeadFromRequest } from "@/server/services/website-lead-capture";
import { resolveWorkspace } from "@/server/workspaces/resolve-workspace";
import { AppError } from "@/server/errors";
import {
  resetWebsiteLeadRateLimitStoreForTests,
  WEBSITE_LEAD_RATE_LIMIT,
} from "@/server/security/website-lead-rate-limit";
import { MAX_WEBSITE_LEAD_REQUEST_BYTES } from "@/server/security/website-lead-request-guards";

const workspace = {
  id: "ws-1",
  slug: "demo",
  name: "Demo",
  timezone: "UTC",
  defaultCurrency: "USD",
};

describe("integrations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWebsiteLeadRateLimitStoreForTests();
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    vi.mocked(resolveWorkspace).mockResolvedValue(workspace);
    vi.mocked(requirePermission).mockResolvedValue({
      membership: {
        id: "m1",
        userId: "user-1",
        workspaceId: "ws-1",
        roleId: "role-1",
        status: "active",
        permissions: ["settings:read", "settings:update"],
      },
    });
  });

  it("lists integrations with settings:read", async () => {
    vi.mocked(listIntegrationsForWorkspace).mockResolvedValue([
      {
        id: "int-1",
        type: "website",
        name: "Website",
        status: "active",
        hasApiKey: true,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      },
    ]);

    const response = await listIntegrations(
      new Request("http://localhost/api/workspaces/demo/integrations"),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.integrations).toHaveLength(1);
    expect(body.data.integrations[0]).not.toHaveProperty("apiKeyHash");
  });

  it("creates website integrations and returns raw API key once", async () => {
    vi.mocked(createIntegrationForWorkspace).mockResolvedValue({
      integration: {
        id: "int-1",
        type: "website",
        name: "Website",
        status: "active",
        hasApiKey: true,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      },
      apiKey: "evocrm_whk_secret",
    });

    const response = await createIntegration(
      new Request("http://localhost/api/workspaces/demo/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "website", name: "Website" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.apiKey).toBe("evocrm_whk_secret");
  });

  it("archives integrations via DELETE", async () => {
    vi.mocked(archiveIntegrationForWorkspace).mockResolvedValue({
      id: "int-1",
      type: "website",
      name: "Website",
      status: "archived",
      hasApiKey: true,
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: new Date(),
    });

    const response = await deleteIntegration(
      new Request("http://localhost/api/workspaces/demo/integrations/int-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", integrationId: "int-1" }) },
    );

    expect(response.status).toBe(200);
    expect(archiveIntegrationForWorkspace).toHaveBeenCalledWith("ws-1", "int-1", "user-1");
  });

  it("returns sanitized integration logs", async () => {
    vi.mocked(listIntegrationLogsForWorkspace).mockResolvedValue([
      {
        id: "log-1",
        workspaceId: "ws-1",
        integrationId: "int-1",
        direction: "inbound",
        status: "success",
        eventType: "website.lead.created",
        payloadSummary: { emailPresent: true, leadId: "lead-1" },
        error: null,
        createdAt: new Date(),
      },
    ]);

    const response = await getLogs(
      new Request("http://localhost/api/workspaces/demo/integrations/int-1/logs"),
      { params: Promise.resolve({ workspaceSlug: "demo", integrationId: "int-1" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.logs[0].payloadSummary).toEqual({
      emailPresent: true,
      leadId: "lead-1",
    });
  });

  it("rotates website API keys", async () => {
    vi.mocked(rotateIntegrationApiKeyForWorkspace).mockResolvedValue({
      integration: {
        id: "int-1",
        type: "website",
        name: "Website",
        status: "active",
        hasApiKey: true,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      },
      apiKey: "evocrm_whk_new",
    });

    const response = await rotateApiKey(
      new Request("http://localhost/api/workspaces/demo/integrations/int-1/rotate-api-key", {
        method: "POST",
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", integrationId: "int-1" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.apiKey).toBe("evocrm_whk_new");
  });

  it("creates website leads from authenticated webhook endpoint", async () => {
    vi.mocked(captureWebsiteLeadFromRequest).mockResolvedValue({
      leadId: "lead-1",
      duplicate: false,
      idempotent: false,
    });

    const response = await captureWebsiteLead(
      new Request("http://localhost/api/integrations/website/leads", {
        method: "POST",
        headers: {
          Authorization: "Bearer evocrm_whk_secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: "John",
          lastName: "Smith",
          email: "john@example.com",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(captureWebsiteLeadFromRequest).toHaveBeenCalled();
  });

  it("returns 401 when webhook API key is missing", async () => {
    const response = await captureWebsiteLead(
      new Request("http://localhost/api/integrations/website/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.50",
        },
        body: JSON.stringify({
          firstName: "John",
          lastName: "Smith",
          email: "john@example.com",
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(captureWebsiteLeadFromRequest).not.toHaveBeenCalled();
  });

  it("returns 400 when Content-Length exceeds the JSON body cap", async () => {
    const response = await captureWebsiteLead(
      new Request("http://localhost/api/integrations/website/leads", {
        method: "POST",
        headers: {
          Authorization: "Bearer evocrm_whk_secret",
          "Content-Type": "application/json",
          "Content-Length": String(MAX_WEBSITE_LEAD_REQUEST_BYTES + 1),
        },
        body: JSON.stringify({
          firstName: "John",
          lastName: "Smith",
          email: "john@example.com",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(captureWebsiteLeadFromRequest).not.toHaveBeenCalled();
  });

  it("returns 429 when website webhook rate limit is exceeded", async () => {
    vi.mocked(captureWebsiteLeadFromRequest).mockResolvedValue({
      leadId: "lead-1",
      duplicate: false,
      idempotent: false,
    });

    const headers = {
      Authorization: "Bearer evocrm_whk_secret",
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.51",
    };
    const body = JSON.stringify({
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
    });

    for (let index = 0; index < WEBSITE_LEAD_RATE_LIMIT.maxRequests; index += 1) {
      const response = await captureWebsiteLead(
        new Request("http://localhost/api/integrations/website/leads", {
          method: "POST",
          headers,
          body,
        }),
      );
      expect(response.status).toBe(200);
    }

    const blocked = await captureWebsiteLead(
      new Request("http://localhost/api/integrations/website/leads", {
        method: "POST",
        headers,
        body,
      }),
    );

    expect(blocked.status).toBe(429);
    const payload = await blocked.json();
    expect(payload.error.code).toBe("RATE_LIMITED");
  });

  it("requires settings:update to create integrations", async () => {
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await createIntegration(
      new Request("http://localhost/api/workspaces/demo/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "website", name: "Website" }),
      }),
      { params: Promise.resolve({ workspaceSlug: "demo" }) },
    );

    expect(response.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "settings:update");
  });

  it("requires settings:update to rotate API keys", async () => {
    vi.mocked(requirePermission).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "Permission denied."),
    );

    const response = await rotateApiKey(
      new Request("http://localhost/api/workspaces/demo/integrations/int-1/rotate-api-key", {
        method: "POST",
      }),
      { params: Promise.resolve({ workspaceSlug: "demo", integrationId: "int-1" }) },
    );

    expect(response.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith("ws-1", "user-1", "settings:update");
  });
});
