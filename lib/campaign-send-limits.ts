/** Default batch size for cron and immediate activation/resume/enrollment sends. */
export const DEFAULT_CAMPAIGN_SEND_BATCH_LIMIT = 50;

/** Hard ceiling for a single send pass (cron query param or immediate burst). */
export const MAX_CAMPAIGN_SEND_BATCH_LIMIT = 200;

/**
 * Clamp a requested campaign send batch size into the safe range.
 * Invalid / missing values fall back to the default.
 */
export function clampCampaignSendBatchLimit(limit?: number | null): number {
  if (limit === undefined || limit === null || !Number.isFinite(limit)) {
    return DEFAULT_CAMPAIGN_SEND_BATCH_LIMIT;
  }

  const normalized = Math.trunc(limit);

  if (normalized < 1) {
    return DEFAULT_CAMPAIGN_SEND_BATCH_LIMIT;
  }

  return Math.min(normalized, MAX_CAMPAIGN_SEND_BATCH_LIMIT);
}
