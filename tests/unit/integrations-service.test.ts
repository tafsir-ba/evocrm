import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/integrations", () => ({
  createIntegration: vi.fn(),
  findIntegrationById: vi.fn(),
  findIntegrations: vi.fn(),
  updateIntegration: vi.fn(),
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

import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  createIntegration,
  findIntegrationById,
  updateIntegration,
} from "@/server/repositories/integrations";
import {
  archiveIntegrationForWorkspace,
  createIntegrationForWorkspace,
  rotateIntegrationApiKeyForWorkspace,
  toIntegrationPublicRecord,
} from "@/server/services/integrations";

const baseIntegration = {
  id: "int-1",
  workspaceId: "ws-1",
  type: "website" as const,
  name: "Website Lead Capture",
  status: "active" as const,
  credentialsEncrypted: null,
  apiKeyHash: "hashed-key",
  createdBy: "user-1",
  archivedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("integrations service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
