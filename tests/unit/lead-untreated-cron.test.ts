import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runLeadUntreatedAutomation = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/lead-untreated-automation", () => ({
  runLeadUntreatedAutomation,
}));

import { POST } from "@/app/api/cron/leads/untreated/route";
import { resetEnvCacheForTests } from "@/server/env";
import {
  resetInternalLeadUntreatedCronWorkerForTests,
  shouldStartInternalLeadUntreatedCron,
  startInternalLeadUntreatedCronWorker,
} from "@/server/lead-untreated-cron-worker";

describe("POST /api/cron/leads/untreated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnvCacheForTests();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017/evocrm");
    runLeadUntreatedAutomation.mockResolvedValue({ moved: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("rejects requests without the cron bearer token", async () => {
    const response = await POST(
      new Request("http://localhost/api/cron/leads/untreated", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(runLeadUntreatedAutomation).not.toHaveBeenCalled();
  });

  it("runs with dry-run, limit, and excluded projects from query and env", async () => {
    vi.stubEnv("LEAD_UNTREATED_EXCLUDED_PROJECT_IDS", "64b0000000000000000000a1, junk");
    const response = await POST(
      new Request(
        "http://localhost/api/cron/leads/untreated?dryRun=1&limit=50&workspaceId=64b000000000000000000001",
        { method: "POST", headers: { Authorization: "Bearer test-cron-secret" } },
      ),
    );
    expect(response.status).toBe(200);
    expect(runLeadUntreatedAutomation).toHaveBeenCalledWith({
      dryRun: true,
      maxUpdatesPerWorkspace: 50,
      workspaceIds: ["64b000000000000000000001"],
      excludedProjectIds: ["64b0000000000000000000a1"],
    });
  });

  it("forces dry run when LEAD_UNTREATED_AUTOMATION_DRY_RUN is set", async () => {
    vi.stubEnv("LEAD_UNTREATED_AUTOMATION_DRY_RUN", "true");
    await POST(
      new Request("http://localhost/api/cron/leads/untreated", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(runLeadUntreatedAutomation).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, maxUpdatesPerWorkspace: 500 }),
    );
  });
});

describe("lead-untreated-cron-worker", () => {
  beforeEach(() => {
    resetInternalLeadUntreatedCronWorkerForTests();
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTAUTH_URL", "https://crm.evo-home.ch");
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetInternalLeadUntreatedCronWorkerForTests();
  });

  it("stays off unless LEAD_UNTREATED_AUTOMATION is enabled", () => {
    vi.stubEnv("LEAD_UNTREATED_AUTOMATION", "");
    expect(shouldStartInternalLeadUntreatedCron()).toBe(false);
    startInternalLeadUntreatedCronWorker();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts to the cron route when enabled", async () => {
    vi.stubEnv("LEAD_UNTREATED_AUTOMATION", "true");
    expect(shouldStartInternalLeadUntreatedCron()).toBe(true);
    startInternalLeadUntreatedCronWorker();
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "https://crm.evo-home.ch/api/cron/leads/untreated",
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer test-cron-secret" },
        }),
      );
    });
  });
});
