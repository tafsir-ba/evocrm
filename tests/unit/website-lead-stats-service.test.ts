import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/integrations", () => ({
  findActiveWebsiteIntegrationByApiKeyHash: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  countActiveLeadsForWorkspace: vi.fn(),
}));

vi.mock("@/server/services/integration-api-keys", () => ({
  hashIntegrationApiKey: vi.fn((key: string) => `hash:${key}`),
  parseIntegrationApiKeyFromRequest: vi.fn(),
}));

import { findActiveWebsiteIntegrationByApiKeyHash } from "@/server/repositories/integrations";
import { countActiveLeadsForWorkspace } from "@/server/repositories/leads";
import { parseIntegrationApiKeyFromRequest } from "@/server/services/integration-api-keys";
import { getWebsiteLeadStatsFromRequest } from "@/server/services/website-lead-stats";
import { AppError } from "@/server/errors";

describe("website lead stats service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns workspace active lead total for a valid API key", async () => {
    vi.mocked(parseIntegrationApiKeyFromRequest).mockReturnValue("evocrm_whk_test");
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue({
      id: "int-1",
      workspaceId: "ws-1",
      type: "website",
      name: "Website",
      status: "active",
      apiKeyHash: "hash",
      credentialsEncrypted: null,
      externalAccountId: null,
      defaultProjectId: "proj-1",
      allowProjectOverride: false,
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });
    vi.mocked(countActiveLeadsForWorkspace).mockResolvedValue(38380);

    const result = await getWebsiteLeadStatsFromRequest(
      new Request("http://localhost/api/integrations/website/stats/leads"),
    );

    expect(result).toEqual({ totalLeads: 38380, workspaceId: "ws-1" });
    expect(countActiveLeadsForWorkspace).toHaveBeenCalledWith("ws-1");
  });

  it("rejects missing API keys", async () => {
    vi.mocked(parseIntegrationApiKeyFromRequest).mockReturnValue(null);

    await expect(
      getWebsiteLeadStatsFromRequest(
        new Request("http://localhost/api/integrations/website/stats/leads"),
      ),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    } satisfies Partial<AppError>);
  });

  it("rejects unknown API keys", async () => {
    vi.mocked(parseIntegrationApiKeyFromRequest).mockReturnValue("bad-key");
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue(null);

    await expect(
      getWebsiteLeadStatsFromRequest(
        new Request("http://localhost/api/integrations/website/stats/leads"),
      ),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    } satisfies Partial<AppError>);
  });
});
