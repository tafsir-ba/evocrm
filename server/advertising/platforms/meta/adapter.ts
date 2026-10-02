import "server-only";

import {
  type AdapterAccountSummary,
  type AdapterCapability,
  type AdapterMutationRequest,
  type AdapterSyncResult,
  type AdvertisingPlatformAdapter,
} from "@/server/advertising/platforms/adapter";
import {
  FixtureMetaGraphClient,
  HttpMetaGraphClient,
  mapAccountStatus,
  type MetaGraphClient,
} from "@/server/advertising/platforms/meta/graph-client";
import { AppError } from "@/server/errors";

const META_READ_CAPABILITIES: readonly AdapterCapability[] = [
  "discover_accounts",
  "sync_hierarchy",
  "sync_metrics",
];

function normalizeStatus(status: string): string {
  const upper = status.toUpperCase();
  if (upper === "ACTIVE") return "active";
  if (upper === "PAUSED") return "paused";
  if (upper === "ARCHIVED" || upper === "DELETED") return "archived";
  return "unknown";
}

/**
 * Meta adapter — Phase 1 read-only.
 * `mutate` always rejects so write scopes cannot be exercised.
 */
export class MetaAdvertisingPlatformAdapter implements AdvertisingPlatformAdapter {
  readonly platform = "meta" as const;
  readonly capabilities = META_READ_CAPABILITIES;

  constructor(private readonly client: MetaGraphClient) {}

  static fromAccessToken(accessToken: string): MetaAdvertisingPlatformAdapter {
    return new MetaAdvertisingPlatformAdapter(new HttpMetaGraphClient(accessToken));
  }

  static fixture(): MetaAdvertisingPlatformAdapter {
    return new MetaAdvertisingPlatformAdapter(new FixtureMetaGraphClient());
  }

  async discoverAccounts(): Promise<AdapterAccountSummary[]> {
    const accounts = await this.client.listAdAccounts();
    return accounts.map((account) => ({
      externalAccountId: account.id.replace(/^act_/, ""),
      name: account.name,
      currency: account.currency,
      timezone: account.timezone,
      status: mapAccountStatus(account.account_status),
    }));
  }

  async syncReadOnly(input: {
    externalAccountIds: string[];
    sinceDate?: string;
  }): Promise<AdapterSyncResult> {
    const accounts = await this.discoverAccounts();
    const selected =
      input.externalAccountIds.length > 0
        ? accounts.filter((account) =>
            input.externalAccountIds.includes(account.externalAccountId),
          )
        : accounts;

    const hierarchy: AdapterSyncResult["hierarchy"] = [];
    const metrics: AdapterSyncResult["metrics"] = [];

    for (const account of selected) {
      const campaigns = await this.client.listCampaigns(account.externalAccountId);
      const adSets = await this.client.listAdSets(account.externalAccountId);
      const ads = await this.client.listAds(account.externalAccountId);

      for (const campaign of campaigns) {
        hierarchy.push({
          externalId: campaign.id,
          parentExternalId: null,
          kind: "campaign",
          name: campaign.name,
          status: normalizeStatus(campaign.status),
          observedState: {
            objective: campaign.objective ?? null,
            accountExternalId: account.externalAccountId,
          },
        });
      }

      for (const adSet of adSets) {
        hierarchy.push({
          externalId: adSet.id,
          parentExternalId: adSet.campaign_id,
          kind: "ad_group",
          name: adSet.name,
          status: normalizeStatus(adSet.status),
          observedState: { accountExternalId: account.externalAccountId },
        });
      }

      for (const ad of ads) {
        hierarchy.push({
          externalId: ad.id,
          parentExternalId: ad.adset_id,
          kind: "ad",
          name: ad.name,
          status: normalizeStatus(ad.status),
          observedState: {
            accountExternalId: account.externalAccountId,
            campaignExternalId: ad.campaign_id,
          },
        });
      }

      const insights = await this.client.listDailyInsights({
        accountId: account.externalAccountId,
        sinceDate: input.sinceDate,
      });

      for (const insight of insights) {
        metrics.push({
          externalEntityId: insight.entityId,
          entityKind: insight.entityKind,
          date: insight.date,
          metrics: {
            spend: insight.spend,
            impressions: insight.impressions,
            reach: insight.reach,
            clicks: insight.clicks,
            ...(insight.cpc != null ? { cpc: insight.cpc } : {}),
            ...(insight.cpm != null ? { cpm: insight.cpm } : {}),
            ...(insight.ctr != null ? { ctr: insight.ctr } : {}),
          },
        });
      }
    }

    return {
      accounts: selected,
      hierarchy,
      metrics,
      syncedAt: new Date(),
    };
  }

  async mutate(_request: AdapterMutationRequest): Promise<never> {
    throw new AppError(
      "FORBIDDEN",
      "Paid ads changes are turned off in this pilot. This connection can only read.",
      { details: { phase: 1, writeScopesEnabled: false } },
    );
  }
}

export function assertMetaReadOnlyCapabilities(
  adapter: AdvertisingPlatformAdapter,
): void {
  const writes = adapter.capabilities.filter(
    (capability) =>
      capability === "mutate_campaign" ||
      capability === "upload_asset" ||
      capability === "export_conversion" ||
      capability === "export_customer_match",
  );
  if (writes.length > 0) {
    throw new AppError(
      "FORBIDDEN",
      "This Meta connection tried to use write permissions. The pilot only allows reading.",
    );
  }
}
