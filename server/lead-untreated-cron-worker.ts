const DEFAULT_INTERVAL_MS = 60 * 60_000;
const MIN_INTERVAL_MS = 15 * 60_000;
const MAX_INTERVAL_MS = 24 * 60 * 60_000;
const CRON_FETCH_TIMEOUT_MS = 5 * 60_000;

let workerStarted = false;
let workerRunning = false;

function parseIntervalMs(): number {
  const raw = process.env.LEAD_UNTREATED_AUTOMATION_INTERVAL_MS;
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

function automationEnabled(): boolean {
  const enabled = process.env.LEAD_UNTREATED_AUTOMATION?.trim().toLowerCase();
  return enabled === "true" || enabled === "1";
}

export function shouldStartInternalLeadUntreatedCron(): boolean {
  if (process.env.NODE_ENV === "test") {
    return false;
  }
  if (!getCronSecret() || !getCronBaseUrl()) {
    return false;
  }
  return automationEnabled();
}

async function runLeadUntreatedCronTick(): Promise<void> {
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
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/cron/leads/untreated`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
      signal: AbortSignal.timeout(CRON_FETCH_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => null)) as { data?: unknown } | null;
    const data = payload?.data as Record<string, unknown> | undefined;
    console.info(
      "[lead-untreated-cron]",
      JSON.stringify({
        at: new Date().toISOString(),
        status: response.status,
        ok: response.ok,
        summary: data
          ? {
              dryRun: data.dryRun,
              cutoff: data.cutoff,
              workspaces: data.workspaces,
              scanned: data.scanned,
              eligible: data.eligible,
              moved: data.moved,
              workspacesSkipped: data.workspacesSkipped,
            }
          : payload,
      }),
    );
    if (!response.ok) {
      console.error("[lead-untreated-cron] request failed", response.status);
    }
  } catch (error) {
    console.error("[lead-untreated-cron] tick failed", error);
  } finally {
    workerRunning = false;
  }
}

export function startInternalLeadUntreatedCronWorker(): void {
  if (workerStarted || !shouldStartInternalLeadUntreatedCron()) {
    return;
  }

  workerStarted = true;
  const intervalMs = parseIntervalMs();
  console.info(
    "[lead-untreated-cron] starting internal worker",
    JSON.stringify({ intervalMs, nodeEnv: process.env.NODE_ENV }),
  );
  void runLeadUntreatedCronTick();
  const timer = setInterval(() => {
    void runLeadUntreatedCronTick();
  }, intervalMs);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

export function resetInternalLeadUntreatedCronWorkerForTests(): void {
  workerStarted = false;
  workerRunning = false;
}
