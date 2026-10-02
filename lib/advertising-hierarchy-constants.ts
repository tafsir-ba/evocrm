/** Phase 1 hierarchy + metrics constants (safe for models + server). */

export const ADVERTISING_ENTITY_KINDS = [
  "account",
  "campaign",
  "ad_group",
  "ad",
] as const;

export type AdvertisingEntityKind = (typeof ADVERTISING_ENTITY_KINDS)[number];

export const ADVERTISING_CAMPAIGN_STATUSES = [
  "active",
  "paused",
  "archived",
  "unknown",
] as const;

export const METRIC_SNAPSHOT_SOURCES = ["meta", "google", "tiktok"] as const;
