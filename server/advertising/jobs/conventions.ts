import "server-only";

/**
 * Background-job / retry / rate-limit / idempotency / sync-freshness conventions
 * for advertising platform work. Foundation only — no job runners in Phase 0.
 */

export const ADVERTISING_JOB_KINDS = [
  "ad_account_discovery",
  "hierarchy_sync",
  "metric_snapshot_sync",
  "asset_upload",
  "action_command_execute",
  "conversion_export",
  "rendition_generate",
] as const;

export type AdvertisingJobKind = (typeof ADVERTISING_JOB_KINDS)[number];

export const ADVERTISING_JOB_CONVENTIONS = {
  /** Exponential backoff base (ms) for transient platform errors. */
  retryBaseMs: 2_000,
  retryMaxAttempts: 5,
  retryJitterRatio: 0.2,
  /** Soft per-connection request budget; adapters must honor before calling out. */
  rateLimit: {
    defaultRequestsPerMinute: 60,
    burst: 10,
  },
  /**
   * Idempotency: every ActionCommand and sync page write uses a stable key
   * scoped by workspaceId + jobKind + external entity id + cursor/version.
   */
  idempotencyKeyParts: ["workspaceId", "jobKind", "externalId", "cursorOrVersion"] as const,
  /**
   * Sync freshness: UI must show lastSuccessfulSyncAt and staleness.
   * Treat data older than softStaleAfterMs as "stale", hardStaleAfterMs as "untrusted".
   */
  syncFreshness: {
    softStaleAfterMs: 60 * 60 * 1000,
    hardStaleAfterMs: 24 * 60 * 60 * 1000,
  },
  /** Phase 1+ jobs are read-only until write scopes are explicitly enabled. */
  defaultWriteScopes: false,
} as const;

export type SyncFreshnessStatus = "fresh" | "stale" | "untrusted" | "never_synced";

export function classifySyncFreshness(
  lastSuccessfulSyncAt: Date | null | undefined,
  now: Date = new Date(),
): SyncFreshnessStatus {
  if (!lastSuccessfulSyncAt) {
    return "never_synced";
  }

  const ageMs = now.getTime() - lastSuccessfulSyncAt.getTime();
  if (ageMs < 0) {
    return "fresh";
  }
  if (ageMs > ADVERTISING_JOB_CONVENTIONS.syncFreshness.hardStaleAfterMs) {
    return "untrusted";
  }
  if (ageMs > ADVERTISING_JOB_CONVENTIONS.syncFreshness.softStaleAfterMs) {
    return "stale";
  }
  return "fresh";
}

export function buildAdvertisingIdempotencyKey(parts: {
  workspaceId: string;
  jobKind: AdvertisingJobKind;
  externalId: string;
  cursorOrVersion: string;
}): string {
  return [
    parts.workspaceId,
    parts.jobKind,
    parts.externalId,
    parts.cursorOrVersion,
  ].join(":");
}
