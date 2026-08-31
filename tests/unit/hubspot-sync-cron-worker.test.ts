import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetInternalHubSpotSyncCronWorkerForTests,
  shouldStartInternalHubSpotSyncCron,
  startInternalHubSpotSyncCronWorker,
} from "@/server/hubspot-sync-cron-worker";

describe("hubspot-sync-cron-worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInternalHubSpotSyncCronWorkerForTests();
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://crm.evo-home.ch");
    vi.stubEnv("NEXTAUTH_URL", "https://crm.evo-home.ch");
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.stubEnv("HUBSPOT_ONGOING_SYNC_RECONCILE", "true");
    vi.stubEnv("HUBSPOT_NOTES_SYNC_RECONCILE", "");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { received: 0, created: 0 } }),
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetInternalHubSpotSyncCronWorkerForTests();
  });

  it("does not start by default even in production", () => {
    vi.stubEnv("HUBSPOT_ONGOING_SYNC_RECONCILE", "");
    vi.stubEnv("HUBSPOT_NOTES_SYNC_RECONCILE", "");
    expect(shouldStartInternalHubSpotSyncCron()).toBe(false);
  });

  it("starts only when the reconcile flag is explicitly enabled", async () => {
    expect(shouldStartInternalHubSpotSyncCron()).toBe(true);
    startInternalHubSpotSyncCronWorker();
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "https://crm.evo-home.ch/api/cron/hubspot/reconcile",
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer test-cron-secret" },
        }),
      );
    });
  });

  it("starts for notes reconcile without the lead reconcile flag and posts the notes cron", async () => {
    vi.stubEnv("HUBSPOT_ONGOING_SYNC_RECONCILE", "");
    vi.stubEnv("HUBSPOT_NOTES_SYNC_RECONCILE", "true");
    expect(shouldStartInternalHubSpotSyncCron()).toBe(true);
    startInternalHubSpotSyncCronWorker();
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "https://crm.evo-home.ch/api/cron/hubspot/notes",
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer test-cron-secret" },
        }),
      );
    });
    expect(fetch).not.toHaveBeenCalledWith(
      "https://crm.evo-home.ch/api/cron/hubspot/reconcile",
      expect.anything(),
    );
  });
});
