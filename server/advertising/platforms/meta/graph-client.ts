import "server-only";

/**
 * Meta Marketing API client contract.
 * Live HTTP is isolated here; sync services never import platform DTOs into routes.
 * Phase 1: read-only. No create/update/delete campaign methods.
 */

export type MetaAdAccountDto = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  account_status?: number;
};

export type MetaCampaignDto = {
  id: string;
  name: string;
  status: string;
  objective?: string;
  account_id: string;
};

export type MetaAdSetDto = {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  account_id: string;
};

export type MetaAdDto = {
  id: string;
  name: string;
  status: string;
  adset_id: string;
  campaign_id: string;
  account_id: string;
};

export type MetaInsightDto = {
  date: string;
  entityId: string;
  entityKind: "account" | "campaign" | "ad_group" | "ad";
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  cpc?: number;
  cpm?: number;
  ctr?: number;
};

/** Read-only Meta Graph surface used by the advertising adapter. */
export type MetaGraphClient = {
  listAdAccounts(): Promise<MetaAdAccountDto[]>;
  listCampaigns(accountId: string): Promise<MetaCampaignDto[]>;
  listAdSets(accountId: string): Promise<MetaAdSetDto[]>;
  listAds(accountId: string): Promise<MetaAdDto[]>;
  listDailyInsights(input: {
    accountId: string;
    sinceDate?: string;
  }): Promise<MetaInsightDto[]>;
};

const META_GRAPH_BASE = "https://graph.facebook.com/v21.0";

function mapAccountStatus(status: number | undefined): "active" | "disabled" | "unknown" {
  if (status === 1) return "active";
  if (status === 2 || status === 3) return "disabled";
  return "unknown";
}

export { mapAccountStatus };

/**
 * Live Meta Graph client. Only constructed when a connection access token is present.
 * Never request write permissions in Phase 1.
 */
export class HttpMetaGraphClient implements MetaGraphClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async getJson<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${META_GRAPH_BASE}${path}`);
    url.searchParams.set("access_token", this.accessToken);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Meta Graph error ${response.status}: ${body.slice(0, 200)}`);
    }

    return (await response.json()) as T;
  }

  async listAdAccounts(): Promise<MetaAdAccountDto[]> {
    const data = await this.getJson<{ data: MetaAdAccountDto[] }>("/me/adaccounts", {
      fields: "id,name,currency,timezone_name,account_status",
      limit: "100",
    });
    return (data.data ?? []).map((row) => ({
      id: row.id.replace(/^act_/, ""),
      name: row.name,
      currency: row.currency,
      timezone: (row as MetaAdAccountDto & { timezone_name?: string }).timezone_name || row.timezone || "UTC",
      account_status: row.account_status,
    }));
  }

  async listCampaigns(accountId: string): Promise<MetaCampaignDto[]> {
    const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const data = await this.getJson<{ data: MetaCampaignDto[] }>(`/${act}/campaigns`, {
      fields: "id,name,status,objective,account_id",
      limit: "200",
    });
    return (data.data ?? []).map((row) => ({
      ...row,
      account_id: accountId.replace(/^act_/, ""),
    }));
  }

  async listAdSets(accountId: string): Promise<MetaAdSetDto[]> {
    const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const data = await this.getJson<{ data: MetaAdSetDto[] }>(`/${act}/adsets`, {
      fields: "id,name,status,campaign_id,account_id",
      limit: "500",
    });
    return (data.data ?? []).map((row) => ({
      ...row,
      account_id: accountId.replace(/^act_/, ""),
    }));
  }

  async listAds(accountId: string): Promise<MetaAdDto[]> {
    const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const data = await this.getJson<{ data: MetaAdDto[] }>(`/${act}/ads`, {
      fields: "id,name,status,adset_id,campaign_id,account_id",
      limit: "500",
    });
    return (data.data ?? []).map((row) => ({
      ...row,
      account_id: accountId.replace(/^act_/, ""),
    }));
  }

  async listDailyInsights(input: {
    accountId: string;
    sinceDate?: string;
  }): Promise<MetaInsightDto[]> {
    const act = input.accountId.startsWith("act_")
      ? input.accountId
      : `act_${input.accountId}`;
    const since =
      input.sinceDate ??
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);

    const data = await this.getJson<{
      data: Array<{
        date_start: string;
        campaign_id?: string;
        adset_id?: string;
        ad_id?: string;
        spend?: string;
        impressions?: string;
        reach?: string;
        clicks?: string;
        cpc?: string;
        cpm?: string;
        ctr?: string;
      }>;
    }>(`/${act}/insights`, {
      fields: "campaign_id,adset_id,ad_id,spend,impressions,reach,clicks,cpc,cpm,ctr",
      level: "ad",
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      limit: "500",
    });

    return (data.data ?? []).map((row) => ({
      date: row.date_start,
      entityId: row.ad_id || row.adset_id || row.campaign_id || input.accountId,
      entityKind: row.ad_id
        ? ("ad" as const)
        : row.adset_id
          ? ("ad_group" as const)
          : row.campaign_id
            ? ("campaign" as const)
            : ("account" as const),
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      reach: Number(row.reach ?? 0),
      clicks: Number(row.clicks ?? 0),
      cpc: row.cpc != null ? Number(row.cpc) : undefined,
      cpm: row.cpm != null ? Number(row.cpm) : undefined,
      ctr: row.ctr != null ? Number(row.ctr) : undefined,
    }));
  }
}

/** Multi-account fixture client for tests and dry-run demos — no network. */
export class FixtureMetaGraphClient implements MetaGraphClient {
  async listAdAccounts(): Promise<MetaAdAccountDto[]> {
    return [
      {
        id: "1001",
        name: "EvoHome Geneva — Brand",
        currency: "CHF",
        timezone: "Europe/Zurich",
        account_status: 1,
      },
      {
        id: "1002",
        name: "EvoHome Geneva — Satigny",
        currency: "CHF",
        timezone: "Europe/Zurich",
        account_status: 1,
      },
    ];
  }

  async listCampaigns(accountId: string): Promise<MetaCampaignDto[]> {
    if (accountId === "1001") {
      return [
        {
          id: "c-brand-1",
          name: "Brand awareness Q3",
          status: "PAUSED",
          objective: "OUTCOME_AWARENESS",
          account_id: "1001",
        },
      ];
    }
    return [
      {
        id: "c-satigny-1",
        name: "Satigny duplex — leads",
        status: "ACTIVE",
        objective: "OUTCOME_LEADS",
        account_id: "1002",
      },
      {
        id: "c-satigny-2",
        name: "Satigny duplex — traffic",
        status: "ACTIVE",
        objective: "OUTCOME_TRAFFIC",
        account_id: "1002",
      },
    ];
  }

  async listAdSets(accountId: string): Promise<MetaAdSetDto[]> {
    if (accountId === "1001") {
      return [
        {
          id: "as-brand-1",
          name: "CH lookalike",
          status: "PAUSED",
          campaign_id: "c-brand-1",
          account_id: "1001",
        },
      ];
    }
    return [
      {
        id: "as-satigny-1",
        name: "Geneva 25km",
        status: "ACTIVE",
        campaign_id: "c-satigny-1",
        account_id: "1002",
      },
      {
        id: "as-satigny-2",
        name: "Interest — new build",
        status: "ACTIVE",
        campaign_id: "c-satigny-2",
        account_id: "1002",
      },
    ];
  }

  async listAds(accountId: string): Promise<MetaAdDto[]> {
    if (accountId === "1001") {
      return [
        {
          id: "ad-brand-1",
          name: "Brand film 15s",
          status: "PAUSED",
          adset_id: "as-brand-1",
          campaign_id: "c-brand-1",
          account_id: "1001",
        },
      ];
    }
    return [
      {
        id: "ad-satigny-1",
        name: "Duplex hero — FR",
        status: "ACTIVE",
        adset_id: "as-satigny-1",
        campaign_id: "c-satigny-1",
        account_id: "1002",
      },
      {
        id: "ad-satigny-2",
        name: "Floor plan carousel",
        status: "ACTIVE",
        adset_id: "as-satigny-2",
        campaign_id: "c-satigny-2",
        account_id: "1002",
      },
    ];
  }

  async listDailyInsights(input: {
    accountId: string;
    sinceDate?: string;
  }): Promise<MetaInsightDto[]> {
    const today = new Date().toISOString().slice(0, 10);
    const ads = await this.listAds(input.accountId);
    return ads.map((ad, index) => ({
      date: today,
      entityId: ad.id,
      entityKind: "ad" as const,
      spend: 120 + index * 40,
      impressions: 8000 + index * 500,
      reach: 5000 + index * 300,
      clicks: 90 + index * 15,
      cpc: 1.3,
      cpm: 15,
      ctr: 1.1,
    }));
  }
}
