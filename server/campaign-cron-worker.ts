import "server-only";

import { getEnv } from "@/server/env";
import { sendDueCampaignEmails } from "@/server/services/campaign-sending";

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 30_000;
const MAX_INTERVAL_MS = 15 * 60_000;

let workerStarted = false;
let workerRunning = false;

function parseIntervalMs(): number {
  const raw = process.env.CAMPAIGN_CRON_INTERVAL_MS;
  if (!raw) {
    return DEFAULT_INTERVAL_MS;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_INTERVAL_MS;
  }

  return Math.min(Math.max(parsed, MIN_INTERVAL_MS), MAX_INTERVAL_MS);
}

export function shouldStartInternalCampaignCron(): boolean {
  if (process.env.NODE_ENV === "test") {
    return false;
  }

  const env = getEnv();

  if (!env.CRON_SECRET) {
    return false;
  }

  if (process.env.CAMPAIGN_CRON_INTERNAL === "false") {
    return false;
  }

  if (process.env.CAMPAIGN_CRON_INTERNAL === "true") {
    return true;
  }

  return env.NODE_ENV === "production";
}

async function runCampaignCronTick(): Promise<void> {
  if (workerRunning) {
    return;
  }

  workerRunning = true;

  try {
    const summary = await sendDueCampaignEmails(50);
    console.info("[campaign-cron]", JSON.stringify({ at: new Date().toISOString(), summary }));
  } catch (error) {
    console.error("[campaign-cron] tick failed", error);
  } finally {
    workerRunning = false;
  }
}

export function startInternalCampaignCronWorker(): void {
  if (workerStarted || !shouldStartInternalCampaignCron()) {
    return;
  }

  workerStarted = true;
  const intervalMs = parseIntervalMs();

  console.info(
    "[campaign-cron] starting internal worker",
    JSON.stringify({ intervalMs, nodeEnv: process.env.NODE_ENV }),
  );

  void runCampaignCronTick();

  const timer = setInterval(() => {
    void runCampaignCronTick();
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

/** Test-only reset. */
export function resetInternalCampaignCronWorkerForTests(): void {
  workerStarted = false;
  workerRunning = false;
}
