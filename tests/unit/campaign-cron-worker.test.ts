import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCacheForTests } from "@/server/env";

vi.mock("@/server/services/campaign-sending", () => ({
  sendDueCampaignEmails: vi.fn(),
}));

import { sendDueCampaignEmails } from "@/server/services/campaign-sending";
import {
  resetInternalCampaignCronWorkerForTests,
  shouldStartInternalCampaignCron,
  startInternalCampaignCronWorker,
} from "@/server/campaign-cron-worker";

describe("campaign-cron-worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnvCacheForTests();
    resetInternalCampaignCronWorkerForTests();
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://crm.evo-home.ch");
    vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017/evocrm");
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    delete process.env.CAMPAIGN_CRON_INTERNAL;
    delete process.env.CAMPAIGN_CRON_INTERVAL_MS;
    vi.mocked(sendDueCampaignEmails).mockResolvedValue({
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    resetInternalCampaignCronWorkerForTests();
    resetEnvCacheForTests();
  });

  it("starts in production when CRON_SECRET is configured", () => {
    expect(shouldStartInternalCampaignCron()).toBe(true);
  });

  it("does not start when CAMPAIGN_CRON_INTERNAL=false", () => {
    process.env.CAMPAIGN_CRON_INTERNAL = "false";
    expect(shouldStartInternalCampaignCron()).toBe(false);
  });

  it("runs an immediate tick and schedules recurring ticks", async () => {
    startInternalCampaignCronWorker();

    await vi.waitFor(() => {
      expect(sendDueCampaignEmails).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(sendDueCampaignEmails).toHaveBeenCalledTimes(2);
  });

  it("does not start without CRON_SECRET", () => {
    vi.stubEnv("CRON_SECRET", "");
    resetEnvCacheForTests();

    expect(shouldStartInternalCampaignCron()).toBe(false);
    startInternalCampaignCronWorker();

    expect(sendDueCampaignEmails).not.toHaveBeenCalled();
  });
});
