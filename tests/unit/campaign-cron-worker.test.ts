import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetInternalCampaignCronWorkerForTests,
  shouldStartInternalCampaignCron,
  startInternalCampaignCronWorker,
} from "@/server/campaign-cron-worker";

describe("campaign-cron-worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInternalCampaignCronWorkerForTests();
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://crm.evo-home.ch");
    vi.stubEnv("NEXTAUTH_URL", "https://crm.evo-home.ch");
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    delete process.env.CAMPAIGN_CRON_INTERNAL;
    delete process.env.CAMPAIGN_CRON_INTERVAL_MS;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: { processed: 1, sent: 1, skipped: 0, failed: 0 },
        }),
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetInternalCampaignCronWorkerForTests();
  });

  it("starts in production when CRON_SECRET and app URL are configured", () => {
    expect(shouldStartInternalCampaignCron()).toBe(true);
  });

  it("does not start when CAMPAIGN_CRON_INTERNAL=false", () => {
    process.env.CAMPAIGN_CRON_INTERNAL = "false";
    expect(shouldStartInternalCampaignCron()).toBe(false);
  });

  it("runs an immediate tick and schedules recurring ticks", async () => {
    startInternalCampaignCronWorker();

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "https://crm.evo-home.ch/api/cron/campaigns/send-due",
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer test-cron-secret" },
        }),
      );
    });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not start without CRON_SECRET", () => {
    vi.stubEnv("CRON_SECRET", "");

    expect(shouldStartInternalCampaignCron()).toBe(false);
    startInternalCampaignCronWorker();

    expect(fetch).not.toHaveBeenCalled();
  });
});
