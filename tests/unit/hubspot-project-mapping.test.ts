import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/integrations", () => ({
  findIntegrationById: vi.fn(),
}));

vi.mock("@/server/repositories/hubspot-project-mappings", () => ({
  listHubSpotProjectMappings: vi.fn(),
  upsertHubSpotProjectMappingInventory: vi.fn(),
  updateHubSpotProjectMapping: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("@/server/security/integration-credentials", () => ({
  decodeHubSpotCredentials: vi.fn(() => ({
    accessToken: "pat-test",
    clientSecret: null,
    portalId: "12345",
  })),
}));

vi.mock("@/server/services/hubspot-client", () => ({
  listHubSpotProjects: vi.fn(),
  probeHubSpotCapabilities: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findIntegrationById } from "@/server/repositories/integrations";
import {
  updateHubSpotProjectMapping,
  upsertHubSpotProjectMappingInventory,
} from "@/server/repositories/hubspot-project-mappings";
import { findProjectById } from "@/server/repositories/projects";
import {
  listHubSpotProjects,
  probeHubSpotCapabilities,
} from "@/server/services/hubspot-client";
import {
  probeHubSpotIntegrationForWorkspace,
  refreshHubSpotProjectInventoryForWorkspace,
  saveHubSpotProjectMappingForWorkspace,
} from "@/server/services/hubspot-project-mapping";

const hubspotIntegration = {
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

describe("hubspot project mapping service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findIntegrationById).mockResolvedValue(hubspotIntegration);
  });

  it("probes HubSpot capabilities with the stored access token", async () => {
    vi.mocked(probeHubSpotCapabilities).mockResolvedValue({
      ok: true,
      checkedAt: "2026-08-29T00:00:00.000Z",
      checks: [],
    });

    const result = await probeHubSpotIntegrationForWorkspace("ws-1", "int-hs", "user-1");
    expect(probeHubSpotCapabilities).toHaveBeenCalledWith("pat-test");
    expect(result.ok).toBe(true);
  });

  it("refreshes HubSpot project inventory into unmapped mapping rows", async () => {
    vi.mocked(listHubSpotProjects).mockResolvedValue([
      { id: "hs-1", name: "Grosvenor", properties: {} },
    ]);
    vi.mocked(upsertHubSpotProjectMappingInventory).mockResolvedValue([
      {
        id: "map-1",
        workspaceId: "ws-1",
        integrationId: "int-hs",
        hubspotProjectId: "hs-1",
        hubspotProjectName: "Grosvenor",
        evoProjectId: null,
        status: "unmapped",
        reviewedBy: null,
        reviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await refreshHubSpotProjectInventoryForWorkspace(
      "ws-1",
      "int-hs",
      "user-1",
    );

    expect(upsertHubSpotProjectMappingInventory).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "int-hs",
      projects: [{ hubspotProjectId: "hs-1", hubspotProjectName: "Grosvenor" }],
    });
    expect(result.hubspotProjectCount).toBe(1);
    expect(result.mappings[0].status).toBe("unmapped");
  });

  it("requires an Evohome project when saving a mapped status", async () => {
    await expect(
      saveHubSpotProjectMappingForWorkspace({
        workspaceId: "ws-1",
        integrationId: "int-hs",
        actorId: "user-1",
        hubspotProjectId: "hs-1",
        status: "mapped",
        evoProjectId: null,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(updateHubSpotProjectMapping).not.toHaveBeenCalled();
  });

  it("saves an explicit mapped destination after validating the Evohome project", async () => {
    vi.mocked(findProjectById).mockResolvedValue({
      id: "project-1",
      archivedAt: null,
    } as never);
    vi.mocked(updateHubSpotProjectMapping).mockResolvedValue({
      id: "map-1",
      workspaceId: "ws-1",
      integrationId: "int-hs",
      hubspotProjectId: "hs-1",
      hubspotProjectName: "Grosvenor",
      evoProjectId: "project-1",
      status: "mapped",
      reviewedBy: "user-1",
      reviewedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await saveHubSpotProjectMappingForWorkspace({
      workspaceId: "ws-1",
      integrationId: "int-hs",
      actorId: "user-1",
      hubspotProjectId: "hs-1",
      status: "mapped",
      evoProjectId: "project-1",
    });

    expect(result.status).toBe("mapped");
    expect(result.evoProjectId).toBe("project-1");
  });
});
