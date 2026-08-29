const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 30_000;
const MAX_INTERVAL_MS = 15 * 60_000;
/** Keep below the default tick interval so a hung HTTP call cannot pin workerRunning. */
const CRON_FETCH_TIMEOUT_MS = 55_000;

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

function getCronSecret(): string | undefined {
  const secret = process.env.CRON_SECRET?.trim();
  return secret || undefined;
}

function getCronBaseUrl(): string | undefined {
  const baseUrl = process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  return baseUrl || undefined;
}

export function shouldStartInternalCampaignCron(): boolean {
  if (process.env.NODE_ENV === "test") {
    return false;
  }

  if (!getCronSecret() || !getCronBaseUrl()) {
    return false;
  }

  if (process.env.CAMPAIGN_CRON_INTERNAL === "false") {
    return false;
  }

  if (process.env.CAMPAIGN_CRON_INTERNAL === "true") {
    return true;
  }

  return process.env.NODE_ENV === "production";
}

async function runCampaignCronTick(): Promise<void> {
  if (workerRunning) {
    return;
  }

  const cronSecret = getCronSecret();
  const baseUrl = getCronBaseUrl();

  if (!cronSecret || !baseUrl) {
    return;
  }

  workerRunning = true;

  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/cron/campaigns/send-due`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
        signal: AbortSignal.timeout(CRON_FETCH_TIMEOUT_MS),
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | { data?: unknown }
      | null;

    console.info(
      "[campaign-cron]",
      JSON.stringify({
        at: new Date().toISOString(),
        status: response.status,
        ok: response.ok,
        summary: payload?.data ?? payload,
      }),
    );

    if (!response.ok) {
      console.error("[campaign-cron] send-due request failed", response.status);
    }
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
