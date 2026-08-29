import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/integrations", () => ({
  createIntegration: vi.fn(),
  findIntegrationById: vi.fn(),
  findIntegrations: vi.fn(),
  updateIntegration: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjects: vi.fn(),
}));

vi.mock("@/server/repositories/integration-logs", () => ({
  findIntegrationLogs: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/services/integration-api-keys", () => ({
  generateIntegrationApiKey: vi.fn(() => "evocrm_whk_test_key"),
  hashIntegrationApiKey: vi.fn(() => "hashed-key"),
}));

vi.mock("@/server/services/project-scope", () => ({
  validateActiveProjectId: vi.fn(),
}));

vi.mock("@/server/services/hubspot-client", () => ({
  assertHubSpotAccessToken: vi.fn(),
}));

vi.mock("@/server/security/integration-credentials", () => ({
  encodeHubSpotCredentials: vi.fn(() => "encrypted-hubspot"),
  decodeHubSpotCredentials: vi.fn(() => ({
    accessToken: "pat-test",
    clientSecret: "secret-test",
    portalId: "12345",
  })),
}));

import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  createIntegration,
  findIntegrationById,
  updateIntegration,
} from "@/server/repositories/integrations";
import { findProjects } from "@/server/repositories/projects";
import { assertHubSpotAccessToken } from "@/server/services/hubspot-client";
import {
  archiveIntegrationForWorkspace,
  createIntegrationForWorkspace,
  rotateIntegrationApiKeyForWorkspace,
  toIntegrationPublicRecord,
  updateIntegrationForWorkspace,
} from "@/server/services/integrations";

const baseIntegration = {
  id: "int-1",
  workspaceId: "ws-1",
  type: "website" as const,
  name: "Website Lead Capture",
  status: "active" as const,
  credentialsEncrypted: null,
  externalAccountId: null,
  apiKeyHash: "hashed-key",
  defaultProjectId: null,
  allowProjectOverride: false,
  createdBy: "user-1",
  archivedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("integrations service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findProjects).mockResolvedValue([
      {
        id: "project-1",
        workspaceId: "ws-1",
        name: "Only Project",
        reference: "only",
        projectType: null,
        defaultDripCampaignId: null,
        statusId: null,
        address: null,
        city: null,
        country: null,
        description: null,
        createdBy: "user-1",
        ownerId: null,
        assignedTo: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  });

  it("sets workspaceId and createdBy server-side on create", async () => {
    vi.mocked(createIntegration).mockResolvedValue(baseIntegration);

    const result = await createIntegrationForWorkspace("ws-1", "user-1", {
      type: "website",
      name: "Website Lead Capture",
    });

    expect(createIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        createdBy: "user-1",
        type: "website",
        status: "active",
        apiKeyHash: "hashed-key",
      }),
    );
    expect(result.apiKey).toBe("evocrm_whk_test_key");
    expect(result.integration.hasApiKey).toBe(true);
  });

  it("creates paused placeholders for mls and ads types", async () => {
    vi.mocked(createIntegration).mockResolvedValue({
      ...baseIntegration,
      id: "int-2",
      type: "mls",
      status: "paused",
      apiKeyHash: null,
    });

    const result = await createIntegrationForWorkspace("ws-1", "user-1", {
      type: "mls",
      name: "MLS Import",
    });

    expect(createIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ type: "mls", status: "paused", apiKeyHash: null }),
    );
    expect(result.apiKey).toBeUndefined();
  });

  it("does not expose apiKeyHash in public integration records", () => {
    const publicRecord = toIntegrationPublicRecord(baseIntegration);

    expect(publicRecord).not.toHaveProperty("apiKeyHash");
    expect(publicRecord.defaultProjectId).toBeNull();
    expect(publicRecord.allowProjectOverride).toBe(false);
    expect(publicRecord).not.toHaveProperty("credentialsEncrypted");
    expect(publicRecord.hasApiKey).toBe(true);
  });

  it("archives integrations instead of hard deleting", async () => {
    vi.mocked(findIntegrationById).mockResolvedValue(baseIntegration);
    vi.mocked(updateIntegration).mockResolvedValue({
      ...baseIntegration,
      status: "archived",
      archivedAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const archived = await archiveIntegrationForWorkspace("ws-1", "int-1", "user-1");

    expect(updateIntegration).toHaveBeenCalledWith(
      "ws-1",
      "int-1",
      expect.objectContaining({ status: "archived", archivedAt: expect.any(Date) }),
    );
    expect(archived.status).toBe("archived");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "integration.archived" }),
    );
  });

  it("rotates website API keys and returns raw key once", async () => {
    vi.mocked(findIntegrationById).mockResolvedValue(baseIntegration);
    vi.mocked(updateIntegration).mockResolvedValue({
      ...baseIntegration,
      apiKeyHash: "new-hash",
    });

    const result = await rotateIntegrationApiKeyForWorkspace("ws-1", "int-1", "user-1");

    expect(updateIntegration).toHaveBeenCalledWith(
      "ws-1",
      "int-1",
      expect.objectContaining({ apiKeyHash: "hashed-key" }),
    );
    expect(result.apiKey).toBe("evocrm_whk_test_key");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "integration.api_key_rotated" }),
    );
  });

  it("requires default project when creating a locked website integration in a multi-project workspace", async () => {
    vi.mocked(findProjects).mockResolvedValue([
      {
        id: "project-1",
        workspaceId: "ws-1",
        name: "Project A",
        reference: "a",
        projectType: null,
        defaultDripCampaignId: null,
        statusId: null,
        address: null,
        city: null,
        country: null,
        description: null,
        createdBy: "user-1",
        ownerId: null,
        assignedTo: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "project-2",
        workspaceId: "ws-1",
        name: "Project B",
        reference: "b",
        projectType: null,
        defaultDripCampaignId: null,
        statusId: null,
        address: null,
        city: null,
        country: null,
        description: null,
        createdBy: "user-1",
        ownerId: null,
        assignedTo: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(
      createIntegrationForWorkspace("ws-1", "user-1", {
        type: "website",
        name: "Website Lead Capture",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("default project"),
    });
    expect(createIntegration).not.toHaveBeenCalled();
  });

  it("rejects clearing default project while locked in a multi-project workspace", async () => {
    vi.mocked(findIntegrationById).mockResolvedValue({
      ...baseIntegration,
      defaultProjectId: "project-1",
      allowProjectOverride: false,
    });
    vi.mocked(findProjects).mockResolvedValue([
      {
        id: "project-1",
        workspaceId: "ws-1",
        name: "Project A",
        reference: "a",
        projectType: null,
        defaultDripCampaignId: null,
        statusId: null,
        address: null,
        city: null,
        country: null,
        description: null,
        createdBy: "user-1",
        ownerId: null,
        assignedTo: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "project-2",
        workspaceId: "ws-1",
        name: "Project B",
        reference: "b",
        projectType: null,
        defaultDripCampaignId: null,
        statusId: null,
        address: null,
        city: null,
        country: null,
        description: null,
        createdBy: "user-1",
        ownerId: null,
        assignedTo: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(
      updateIntegrationForWorkspace("ws-1", "int-1", "user-1", {
        defaultProjectId: null,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(updateIntegration).not.toHaveBeenCalled();
  });

  it("creates a HubSpot integration with encrypted credentials and portal id", async () => {
    const hubspotIntegration = {
      ...baseIntegration,
      id: "int-hs",
      type: "hubspot" as const,
      name: "HubSpot CRM",
      apiKeyHash: null,
      credentialsEncrypted: "encrypted-hubspot",
      externalAccountId: "12345",
      defaultProjectId: "project-1",
    };
    vi.mocked(createIntegration).mockResolvedValue(hubspotIntegration);

    const result = await createIntegrationForWorkspace("ws-1", "user-1", {
      type: "hubspot",
      name: "HubSpot CRM",
      defaultProjectId: "project-1",
      hubspotAccessToken: "pat-xxxxxxxx",
      hubspotClientSecret: "client-secret-xx",
      hubspotPortalId: "12345",
    });

    expect(assertHubSpotAccessToken).toHaveBeenCalledWith("pat-xxxxxxxx");
    expect(createIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "hubspot",
        credentialsEncrypted: "encrypted-hubspot",
        externalAccountId: "12345",
        defaultProjectId: "project-1",
        allowProjectOverride: false,
        apiKeyHash: null,
      }),
    );
    expect(result.integration.hasCredentials).toBe(true);
    expect(result.integration.externalAccountId).toBe("12345");
    expect(result.apiKey).toBeUndefined();
  });
});
