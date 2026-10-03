import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/models/campaign-send", () => ({
  CampaignSendModel: {
    aggregate: vi.fn(),
  },
}));

import { CampaignSendModel } from "@/models/campaign-send";
import { countCampaignSendsByStatus } from "@/server/repositories/campaign-sends";

const WORKSPACE_ID = "6a2f0444438006b304af77ec";
const CAMPAIGN_ID = "6ac0ad42b7e4703ec7247dcb";

/**
 * Documents the distinct-enrollment aggregation shape used by
 * countCampaignSendsByStatus so retries do not inflate failed/skipped totals.
 */
describe("newsletter send status counting semantics", () => {
  it("counts one enrollment once even with multiple failed attempt rows", () => {
    const rows = [
      { enrollmentId: "e1", status: "failed" },
      { enrollmentId: "e1", status: "failed" },
      { enrollmentId: "e2", status: "failed" },
      { enrollmentId: "e3", status: "sent" },
      { enrollmentId: "e3", status: "skipped" },
    ];

    const byStatusEnrollment = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = byStatusEnrollment.get(row.status) ?? new Set<string>();
      set.add(row.enrollmentId);
      byStatusEnrollment.set(row.status, set);
    }

    expect(byStatusEnrollment.get("failed")?.size).toBe(2);
    expect(byStatusEnrollment.get("sent")?.size).toBe(1);
    expect(byStatusEnrollment.get("skipped")?.size).toBe(1);
  });
});

describe("countCampaignSendsByStatus ObjectId $match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("casts workspaceId and campaignId to ObjectId in aggregate $match", async () => {
    vi.mocked(CampaignSendModel.aggregate).mockResolvedValue([
      { _id: "sent", count: 362 },
    ] as never);

    const counts = await countCampaignSendsByStatus(WORKSPACE_ID, CAMPAIGN_ID);

    expect(CampaignSendModel.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: {
            workspaceId: new Types.ObjectId(WORKSPACE_ID),
            campaignId: new Types.ObjectId(CAMPAIGN_ID),
          },
        }),
      ]),
    );

    // Live Cressy-shaped outcome: status bucket sent=362 (queued/failed/skipped empty).
    // Delivered/bounced/pending come from oid() aggregateSendMetrics (359/1/2), not this counter.
    expect(counts).toEqual({
      queued: 0,
      sent: 362,
      failed: 0,
      skipped: 0,
    });
  });

  it("does not pass string ids in aggregate $match (failure mode that zeroed Sent)", async () => {
    vi.mocked(CampaignSendModel.aggregate).mockResolvedValue([] as never);

    await countCampaignSendsByStatus(WORKSPACE_ID, CAMPAIGN_ID);

    const pipeline = vi.mocked(CampaignSendModel.aggregate).mock.calls[0]?.[0] as Array<{
      $match?: { workspaceId?: unknown; campaignId?: unknown };
    }>;
    const match = pipeline.find((stage) => stage.$match)?.$match;

    expect(match?.workspaceId).toBeInstanceOf(Types.ObjectId);
    expect(match?.campaignId).toBeInstanceOf(Types.ObjectId);
    expect(typeof match?.workspaceId).not.toBe("string");
    expect(typeof match?.campaignId).not.toBe("string");
  });
});
