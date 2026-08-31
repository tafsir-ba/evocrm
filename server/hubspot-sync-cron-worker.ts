const DEFAULT_INTERVAL_MS = 15 * 60_000;
const MIN_INTERVAL_MS = 5 * 60_000;
const MAX_INTERVAL_MS = 60 * 60_000;
const CRON_FETCH_TIMEOUT_MS = 55_000;

let workerStarted = false;
let workerRunning = false;

function parseIntervalMs(): number {
  const raw = process.env.HUBSPOT_SYNC_RECONCILE_INTERVAL_MS;
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

export function shouldStartInternalHubSpotSyncCron(): boolean {
  if (process.env.NODE_ENV === "test") {
    return false;
  }
  if (!getCronSecret() || !getCronBaseUrl()) {
    return false;
  }
  const enabled = process.env.HUBSPOT_ONGOING_SYNC_RECONCILE?.trim().toLowerCase();
  return enabled === "true" || enabled === "1";
}

async function runHubSpotSyncCronTick(): Promise<void> {
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
      `${baseUrl.replace(/\/$/, "")}/api/cron/hubspot/reconcile`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${cronSecret}` },
        signal: AbortSignal.timeout(CRON_FETCH_TIMEOUT_MS),
      },
    );
    const payload = (await response.json().catch(() => null)) as { data?: unknown } | null;
    console.info(
      "[hubspot-sync-cron]",
      JSON.stringify({
        at: new Date().toISOString(),
        status: response.status,
        ok: response.ok,
        summary: payload?.data ?? payload,
      }),
    );
  } catch (error) {
    console.error("[hubspot-sync-cron] tick failed", error);
  } finally {
    workerRunning = false;
  }
}

export function startInternalHubSpotSyncCronWorker(): void {
  if (workerStarted || !shouldStartInternalHubSpotSyncCron()) {
    return;
  }

  workerStarted = true;
  const intervalMs = parseIntervalMs();
  console.info(
    "[hubspot-sync-cron] starting internal worker",
    JSON.stringify({ intervalMs, nodeEnv: process.env.NODE_ENV }),
  );
  void runHubSpotSyncCronTick();
  const timer = setInterval(() => {
    void runHubSpotSyncCronTick();
  }, intervalMs);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

export function resetInternalHubSpotSyncCronWorkerForTests(): void {
  workerStarted = false;
  workerRunning = false;
}
