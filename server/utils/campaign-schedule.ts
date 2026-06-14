import "server-only";

/** Minimum wait before the first (or zero-delay) step is eligible for cron pickup. */
export const IMMEDIATE_SEND_DELAY_MS = 60_000;

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function computeNextSendAt(anchor: Date, delayDays: number): Date {
  if (delayDays <= 0) {
    return new Date(anchor.getTime() + IMMEDIATE_SEND_DELAY_MS);
  }

  return addDays(anchor, delayDays);
}
