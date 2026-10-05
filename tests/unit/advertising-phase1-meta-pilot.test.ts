import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({
  getEnv: vi.fn(() => ({
    NEXTAUTH_SECRET: "test-nextauth-secret-for-credentials",
    INTEGRATION_API_KEY_PEPPER: undefined,
  })),
}));

import { ADVERTISING_DEFAULTS } from "@/server/advertising/defaults";
import { classifySyncFreshness } from "@/server/advertising/jobs/conventions";
import {
  MetaAdvertisingPlatformAdapter,
  assertMetaReadOnlyCapabilities,
} from "@/server/advertising/platforms/meta/adapter";
import {
  decodeMetaCredentials,
  encodeMetaCredentials,
} from "@/server/advertising/platforms/meta/credentials";
import { AppError } from "@/server/errors";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

describe("Phase 1 pilot selection", () => {
  it("names Satigny Duplex in Geneva, Switzerland", () => {
    expect(ADVERTISING_DEFAULTS.pilotSelection.projectName).toMatch(/satigny/i);
    expect(ADVERTISING_DEFAULTS.pilotSelection.projectReference).toBe("satigny_duplex");
    expect(ADVERTISING_DEFAULTS.pilotSelection.countryCode).toBe("CH");
    expect(ADVERTISING_DEFAULTS.pilotSelection.marketLabel).toMatch(/geneva/i);
    expect(ADVERTISING_DEFAULTS.pilotSelection.namedInPhase0).toBe(true);
  });

  it("requests Meta read-only scopes only", () => {
    expect(ADVERTISING_DEFAULTS.metaReadOnlyScopes).toEqual([
      "ads_read",
      "business_management",
    ]);
    expect(ADVERTISING_DEFAULTS.metaReadOnlyScopes.join(" ")).not.toMatch(
      /ads_management|pages_manage|publish|write/i,
    );
  });
});

describe("Meta fixture adapter (no network)", () => {
  it("syncs multi-account hierarchy + dated metrics", async () => {
    const adapter = MetaAdvertisingPlatformAdapter.fixture();
    assertMetaReadOnlyCapabilities(adapter);
    expect(adapter.capabilities).toEqual([
      "discover_accounts",
      "sync_hierarchy",
      "sync_metrics",
    ]);

    const result = await adapter.syncReadOnly({ externalAccountIds: [] });
    expect(result.accounts.length).toBeGreaterThanOrEqual(2);
    expect(result.accounts.map((account) => account.externalAccountId).sort()).toEqual([
      "1001",
      "1002",
    ]);

    const campaigns = result.hierarchy.filter((node) => node.kind === "campaign");
    const adGroups = result.hierarchy.filter((node) => node.kind === "ad_group");
    const ads = result.hierarchy.filter((node) => node.kind === "ad");
    expect(campaigns.length).toBeGreaterThanOrEqual(2);
    expect(adGroups.length).toBeGreaterThanOrEqual(2);
    expect(ads.length).toBeGreaterThanOrEqual(2);
    expect(result.metrics.length).toBeGreaterThan(0);
    expect(result.metrics.every((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date))).toBe(
      true,
    );
    expect(result.syncedAt).toBeInstanceOf(Date);
  });

  it("rejects mutate — write scopes never exercised", async () => {
    const adapter = MetaAdvertisingPlatformAdapter.fixture();
    await expect(
      adapter.mutate({
        idempotencyKey: "test",
        externalEntityId: "c-satigny-1",
        operation: "pause",
        payload: {},
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("assertMetaReadOnlyCapabilities rejects write-capable adapters", () => {
    expect(() =>
      assertMetaReadOnlyCapabilities({
        platform: "meta",
        capabilities: ["discover_accounts", "mutate_campaign"],
        discoverAccounts: async () => [],
        syncReadOnly: async () => ({
          accounts: [],
          hierarchy: [],
          metrics: [],
          syncedAt: new Date(),
        }),
      }),
    ).toThrow(AppError);
  });
});

describe("Meta credentials vault", () => {
  it("round-trips fixture credentials", () => {
    const encoded = encodeMetaCredentials({
      accessToken: "",
      businessId: null,
      useFixture: true,
    });
    const decoded = decodeMetaCredentials(encoded);
    expect(decoded.useFixture).toBe(true);
    expect(decoded.accessToken).toBe("");
  });

  it("round-trips access token credentials", () => {
    const encoded = encodeMetaCredentials({
      accessToken: "EAAB-test-token",
      businessId: "biz-1",
      useFixture: false,
    });
    expect(decodeMetaCredentials(encoded)).toEqual({
      accessToken: "EAAB-test-token",
      businessId: "biz-1",
      useFixture: false,
    });
  });
});

describe("workspace isolation helpers", () => {
  it("withWorkspaceScope always stamps server workspaceId", () => {
    const scoped = withWorkspaceScope("ws-a", {
      externalCampaignId: "c-1",
      workspaceId: "ws-attacker",
    });
    expect(scoped.workspaceId).toBe("ws-a");
    expect(scoped.externalCampaignId).toBe("c-1");
  });

  it("freshness labels stay accurate for overview", () => {
    expect(classifySyncFreshness(null)).toBe("never_synced");
    expect(classifySyncFreshness(new Date())).toBe("fresh");
    expect(
      classifySyncFreshness(new Date(Date.now() - 2 * 60 * 60 * 1000)),
    ).toBe("stale");
    expect(
      classifySyncFreshness(new Date(Date.now() - 25 * 60 * 60 * 1000)),
    ).toBe("untrusted");
  });
});

describe("sync service write-guard + isolation", () => {
  const originalFlag = process.env.ADVERTISING_ENABLED;

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    if (originalFlag === undefined) {
      delete process.env.ADVERTISING_ENABLED;
    } else {
      process.env.ADVERTISING_ENABLED = originalFlag;
    }
  });

  it("refuses sync when writeScopesEnabled is true", async () => {
    process.env.ADVERTISING_ENABLED = "true";

    vi.doMock("@/server/repositories/ad-connections", () => ({
      findAdConnectionById: vi.fn(async () => ({
        id: "conn-1",
        workspaceId: "ws-a",
        platform: "meta",
        name: "Meta",
        status: "active",
        credentialsEncrypted: "x",
        externalBusinessId: null,
        grantedScopes: ["ads_read"],
        writeScopesEnabled: true,
        healthMessage: null,
        lastSuccessfulSyncAt: null,
        lastSyncAttemptAt: null,
        lastSyncError: null,
        createdBy: "user-1",
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findAdConnections: vi.fn(),
      createAdConnection: vi.fn(),
      updateAdConnection: vi.fn(),
    }));

    const { syncMetaConnectionForWorkspace } = await import(
      "@/server/services/advertising-meta-sync"
    );

    await expect(
      syncMetaConnectionForWorkspace({
        workspaceId: "ws-a",
        actorId: "user-1",
        connectionId: "conn-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("overview queries stay workspace-scoped (no cross-workspace ids)", async () => {
    process.env.ADVERTISING_ENABLED = "true";

    const findGrowthCampaigns = vi.fn(async (workspaceId: string) => {
      expect(workspaceId).toBe("ws-a");
      return [];
    });
    const findAdAccounts = vi.fn(async (workspaceId: string) => {
      expect(workspaceId).toBe("ws-a");
      return [];
    });
    const findAdConnections = vi.fn(async (workspaceId: string) => {
      expect(workspaceId).toBe("ws-a");
      return [];
    });
    const findAdvertisingCampaigns = vi.fn(async (workspaceId: string) => {
      expect(workspaceId).toBe("ws-a");
      return [];
    });
    const findMetricSnapshots = vi.fn(async (workspaceId: string) => {
      expect(workspaceId).toBe("ws-a");
      return [];
    });
    const findProjectById = vi.fn(async (workspaceId: string) => {
      expect(workspaceId).toBe("ws-a");
      return {
        id: "proj-1",
        reference: "satigny_duplex",
      };
    });
    const summarizeProjectOutcomeFunnel = vi.fn(async () => ({
      attributionModel: "last_touch" as const,
      attributionLabel: "Last touch — the most recent paid click gets the credit (v1)",
      formLeads: 0,
      qualifiedLeads: 0,
      opportunities: 0,
      wonCount: 0,
      lostCount: 0,
      wonValue: 0,
      pipelineValue: 0,
      costPerFormLead: null,
      costPerQualifiedLead: null,
      roas: null,
    }));

    vi.doMock("@/server/repositories/growth-campaigns", () => ({
      findGrowthCampaigns,
      createGrowthCampaign: vi.fn(),
      addTrustedDestination: vi.fn(),
    }));
    vi.doMock("@/server/repositories/ad-accounts", () => ({
      findAdAccounts,
      upsertAdAccount: vi.fn(),
    }));
    vi.doMock("@/server/repositories/ad-connections", () => ({
      findAdConnections,
      findAdConnectionById: vi.fn(),
      createAdConnection: vi.fn(),
      updateAdConnection: vi.fn(),
    }));
    vi.doMock("@/server/repositories/advertising-hierarchy", () => ({
      findAdvertisingCampaigns,
      findAdGroups: vi.fn(async () => []),
      findAds: vi.fn(async () => []),
      findMetricSnapshots,
      upsertAdvertisingCampaign: vi.fn(),
      upsertAdGroup: vi.fn(),
      upsertAd: vi.fn(),
      upsertMetricSnapshot: vi.fn(),
    }));
    vi.doMock("@/server/repositories/projects", () => ({
      findProjectById,
      findProjectByReference: vi.fn(),
    }));
    vi.doMock("@/server/services/advertising-attribution", () => ({
      lastTouchAttributionLabel: () =>
        "Last touch — the most recent paid click gets the credit (v1)",
      summarizeProjectOutcomeFunnel,
    }));
    vi.doMock("@/server/repositories/integrations", () => ({
      findIntegrations: vi.fn(async () => []),
    }));

    const { getGrowthCampaignOverviewForWorkspace } = await import(
      "@/server/services/advertising-meta-sync"
    );

    const overview = await getGrowthCampaignOverviewForWorkspace({
      workspaceId: "ws-a",
      projectId: "proj-1",
    });

    expect(overview.readOnly).toBe(true);
    expect(overview.pilot.projectReference).toBe("satigny_duplex");
    expect(overview.hierarchy).toEqual([]);
    expect(overview.outcomes?.formLeads).toBe(0);
    expect(
      overview.growthCampaign === null ||
        overview.growthCampaign.attributionPolicyLabel,
    ).toBeTruthy();
    expect(overview.optimisation.kind).toBe("refresh_data");
    expect(overview.optimisation.needsSettingsRefresh).toBe(true);
    expect(overview.funnel).toEqual({
      formLeads: 0,
      qualifiedLeads: 0,
      opportunities: 0,
      wins: 0,
    });
    expect(findGrowthCampaigns).toHaveBeenCalledWith("ws-a", { projectId: "proj-1" });
    expect(findAdAccounts).toHaveBeenCalledWith("ws-a");
    expect(findAdConnections).toHaveBeenCalledWith("ws-a");
    expect(summarizeProjectOutcomeFunnel).toHaveBeenCalledWith("ws-a", "proj-1", 0);
  });
});
