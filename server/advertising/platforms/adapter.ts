import "server-only";

import { AD_PLATFORMS, type AdPlatform } from "@/lib/advertising-constants";

/**
 * Common advertising platform adapter contract.
 * Phase 0: types + contract only — no Meta/Google/TikTok HTTP clients.
 * Routes and core services must depend on this contract, never platform DTOs.
 */

export { AD_PLATFORMS, type AdPlatform };

export type AdapterCapability =
  | "discover_accounts"
  | "sync_hierarchy"
  | "sync_metrics"
  | "upload_asset"
  | "mutate_campaign"
  | "export_conversion"
  | "export_customer_match";

export type AdapterAccountSummary = {
  externalAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  status: "active" | "disabled" | "unknown";
};

export type AdapterHierarchyNode = {
  externalId: string;
  parentExternalId: string | null;
  kind: "campaign" | "ad_group" | "ad";
  name: string;
  status: string;
  desiredState?: Record<string, unknown>;
  observedState?: Record<string, unknown>;
};

export type AdapterMetricPoint = {
  externalEntityId: string;
  entityKind: "account" | "campaign" | "ad_group" | "ad";
  date: string; // YYYY-MM-DD in account timezone
  metrics: Record<string, number>;
};

export type AdapterSyncResult = {
  accounts: AdapterAccountSummary[];
  hierarchy: AdapterHierarchyNode[];
  metrics: AdapterMetricPoint[];
  syncedAt: Date;
};

export type AdapterMutationRequest = {
  idempotencyKey: string;
  externalEntityId: string;
  operation: string;
  payload: Record<string, unknown>;
};

export type AdapterMutationResult = {
  ok: boolean;
  externalRequestId: string | null;
  observedState?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
};

/**
 * Platform adapters implement this interface behind the advertising module.
 * Phase 0 forbids concrete network clients — use NullAdvertisingPlatformAdapter in tests.
 */
export type AdvertisingPlatformAdapter = {
  readonly platform: AdPlatform;
  readonly capabilities: readonly AdapterCapability[];
  discoverAccounts(): Promise<AdapterAccountSummary[]>;
  syncReadOnly(input: {
    externalAccountIds: string[];
    sinceDate?: string;
  }): Promise<AdapterSyncResult>;
  mutate?(request: AdapterMutationRequest): Promise<AdapterMutationResult>;
};

/** Safe placeholder — never performs network I/O. */
export class NullAdvertisingPlatformAdapter implements AdvertisingPlatformAdapter {
  readonly platform: AdPlatform;
  readonly capabilities: readonly AdapterCapability[] = [];

  constructor(platform: AdPlatform = "meta") {
    this.platform = platform;
  }

  async discoverAccounts(): Promise<AdapterAccountSummary[]> {
    return [];
  }

  async syncReadOnly(_input: {
    externalAccountIds: string[];
    sinceDate?: string;
  }): Promise<AdapterSyncResult> {
    return {
      accounts: [],
      hierarchy: [],
      metrics: [],
      syncedAt: new Date(),
    };
  }
}

export function assertNoPlatformNetworkInPhase0(
  adapter: AdvertisingPlatformAdapter,
): void {
  if (!(adapter instanceof NullAdvertisingPlatformAdapter)) {
    // Soft guard for Phase 0 tests — concrete clients belong in Phase 1+.
    if (adapter.capabilities.some((c) => c !== "discover_accounts" && c !== "sync_hierarchy" && c !== "sync_metrics")) {
      throw new Error(
        "Phase 0 forbids write-capable platform adapters. Use NullAdvertisingPlatformAdapter.",
      );
    }
  }
}
