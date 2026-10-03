import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildNewsletterDeliveryRateSummary,
  classifyNewsletterIssue,
  matchesEngagementPartition,
  NEWSLETTER_NOT_OPENED_BASIS,
} from "@/lib/newsletter-engagement-analytics";
import { AppError } from "@/server/errors";
import { campaignRecordExtras } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/server/repositories/campaigns", () => ({
  findCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-steps", () => ({
  findCampaignSteps: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadsByIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/server/services/apply-project-scope", () => ({
  assertMultiProjectRecordAccess: vi.fn(),
}));

vi.mock("@/models/campaign-send", () => ({
  CampaignSendModel: {
    countDocuments: vi.fn(),
    find: vi.fn(),
  },
}));

import { findCampaignById } from "@/server/repositories/campaigns";
import { findCampaignSteps } from "@/server/repositories/campaign-steps";
import { findLeadsByIds } from "@/server/repositories/leads";
import { assertMultiProjectRecordAccess } from "@/server/services/apply-project-scope";
import { CampaignSendModel } from "@/models/campaign-send";
import {
  listCampaignAnalyticsEngagementForWorkspace,
  listCampaignAnalyticsIssuesForWorkspace,
} from "@/server/services/campaign-analytics";

const WORKSPACE_ID = "507f1f77bcf86cd799439011";
const CAMPAIGN_ID = "507f1f77bcf86cd799439012";
const PROJECT_ID = "507f1f77bcf86cd799439013";
const LEAD_ID = "507f1f77bcf86cd799439014";

const newsletter = {
  id: CAMPAIGN_ID,
  workspaceId: WORKSPACE_ID,
  name: "Spring update",
  status: "active" as const,
  ...campaignRecordExtras,
  kind: "newsletter" as const,
  projectIds: [PROJECT_ID],
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
};

function mockFindChain(docs: unknown[]) {
  const lean = vi.fn().mockResolvedValue(docs);
  const limit = vi.fn().mockReturnValue({ lean });
  const skip = vi.fn().mockReturnValue({ limit });
  const sort = vi.fn().mockReturnValue({ skip });
  vi.mocked(CampaignSendModel.find).mockReturnValue({ sort } as never);
  return { sort, skip, limit, lean };
}

describe("newsletter delivery rate summary", () => {
  it("computes delivered / sent with supporting counts", () => {
    const summary = buildNewsletterDeliveryRateSummary({
      queued: 2,
      stillQueued: 1,
      sent: 100,
      delivered: 94,
      failed: 3,
      bounced: 2,
      skipped: 1,
    });

    expect(summary.deliveryRate).toBe(94);
    expect(summary.attempted).toBe(100);
    expect(summary.queued).toBe(2);
    expect(summary.failed).toBe(3);
    expect(summary.bounced).toBe(2);
    expect(summary.skipped).toBe(1);
  });

  it("returns null delivery rate when nothing was sent", () => {
    expect(
      buildNewsletterDeliveryRateSummary({
        queued: 5,
        stillQueued: 5,
        sent: 0,
        delivered: 0,
        failed: 0,
        bounced: 0,
        skipped: 0,
      }).deliveryRate,
    ).toBeNull();
  });
});

describe("opened / not-opened partitioning", () => {
  const opened = {
    id: "1",
    status: "sent",
    deliveredAt: "2026-10-01T10:00:00.000Z",
    firstOpenedAt: "2026-10-01T11:00:00.000Z",
  };
  const deliveredNotOpened = {
    id: "2",
    status: "sent",
    deliveredAt: "2026-10-01T10:00:00.000Z",
    firstOpenedAt: null,
  };
  const sentPending = {
    id: "3",
    status: "sent",
    deliveredAt: null,
    firstOpenedAt: null,
  };
  const failed = {
    id: "4",
    status: "failed",
    deliveredAt: null,
    firstOpenedAt: null,
  };

  it("partitions unique openers", () => {
    expect(matchesEngagementPartition(opened, "opened")).toBe(true);
    expect(matchesEngagementPartition(deliveredNotOpened, "opened")).toBe(false);
    expect(matchesEngagementPartition(sentPending, "opened")).toBe(false);
    expect(matchesEngagementPartition(failed, "opened")).toBe(false);
  });

  it("partitions not-opened among delivered only", () => {
    expect(matchesEngagementPartition(deliveredNotOpened, "not_opened")).toBe(true);
    expect(matchesEngagementPartition(opened, "not_opened")).toBe(false);
    expect(matchesEngagementPartition(sentPending, "not_opened")).toBe(false);
    expect(matchesEngagementPartition(failed, "not_opened")).toBe(false);
    expect(NEWSLETTER_NOT_OPENED_BASIS).toMatch(/Delivered recipients/i);
  });
});

describe("issue classification granularity", () => {
  it("classifies skipped and status-failed with reasons", () => {
    expect(
      classifyNewsletterIssue({
        status: "skipped",
        error: "Unsubscribed",
        scheduledFor: "2026-10-01T09:00:00.000Z",
      }),
    ).toMatchObject({
      issueType: "skipped",
      reason: "Unsubscribed",
    });

    expect(
      classifyNewsletterIssue({
        status: "failed",
        error: "Provider rejected",
        scheduledFor: "2026-10-01T09:00:00.000Z",
      }),
    ).toMatchObject({
      issueType: "failed",
      reason: "Provider rejected",
    });
  });

  it("prefers complaint then bounce then provider fail then delay", () => {
    expect(
      classifyNewsletterIssue({
        status: "sent",
        complainedAt: "2026-10-01T12:00:00.000Z",
        bouncedAt: "2026-10-01T11:00:00.000Z",
        providerFailedAt: "2026-10-01T10:00:00.000Z",
        deliveryDelayedAt: "2026-10-01T09:30:00.000Z",
      })?.issueType,
    ).toBe("complained");

    expect(
      classifyNewsletterIssue({
        status: "sent",
        bouncedAt: "2026-10-01T11:00:00.000Z",
        providerError: "550 mailbox unavailable",
      }),
    ).toMatchObject({
      issueType: "bounced",
      reason: "550 mailbox unavailable",
    });

    expect(
      classifyNewsletterIssue({
        status: "sent",
        deliveryDelayedAt: "2026-10-01T09:30:00.000Z",
        providerError: "Temporary deferral",
      })?.issueType,
    ).toBe("delayed");
  });
});

describe("engagement + issues service listing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findCampaignById).mockResolvedValue(newsletter as never);
    vi.mocked(findCampaignSteps).mockResolvedValue([]);
    vi.mocked(assertMultiProjectRecordAccess).mockResolvedValue(undefined as never);
    vi.mocked(findLeadsByIds).mockResolvedValue([
      {
        id: LEAD_ID,
        fullName: "Ada Lovelace",
        email: "ada@example.com",
      },
    ] as never);
  });

  it("lists unique openers with name, email, and opened time", async () => {
    vi.mocked(CampaignSendModel.countDocuments).mockResolvedValue(1 as never);
    mockFindChain([
      {
        _id: { toString: () => "507f1f77bcf86cd799439021" },
        leadId: { toString: () => LEAD_ID },
        firstOpenedAt: new Date("2026-10-01T11:00:00.000Z"),
        deliveredAt: new Date("2026-10-01T10:00:00.000Z"),
        sentAt: new Date("2026-10-01T09:00:00.000Z"),
      },
    ]);

    const result = await listCampaignAnalyticsEngagementForWorkspace(
      WORKSPACE_ID,
      CAMPAIGN_ID,
      { partition: "opened", userId: "user-1" },
    );

    expect(CampaignSendModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        firstOpenedAt: { $ne: null },
      }),
    );
    expect(result.total).toBe(1);
    expect(result.recipients[0]).toMatchObject({
      leadName: "Ada Lovelace",
      email: "ada@example.com",
      firstOpenedAt: "2026-10-01T11:00:00.000Z",
    });
    expect(assertMultiProjectRecordAccess).toHaveBeenCalledWith(
      WORKSPACE_ID,
      "user-1",
      [PROJECT_ID],
      "campaign:read",
    );
  });

  it("lists not-opened among delivered recipients", async () => {
    vi.mocked(CampaignSendModel.countDocuments).mockResolvedValue(1 as never);
    mockFindChain([
      {
        _id: { toString: () => "507f1f77bcf86cd799439022" },
        leadId: { toString: () => LEAD_ID },
        firstOpenedAt: null,
        deliveredAt: new Date("2026-10-01T10:00:00.000Z"),
        sentAt: new Date("2026-10-01T09:00:00.000Z"),
      },
    ]);

    const result = await listCampaignAnalyticsEngagementForWorkspace(
      WORKSPACE_ID,
      CAMPAIGN_ID,
      { partition: "not_opened", userId: "user-1" },
    );

    expect(CampaignSendModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        deliveredAt: { $ne: null },
        firstOpenedAt: null,
      }),
    );
    expect(result.partition).toBe("not_opened");
    expect(result.notOpenedBasis).toMatch(/Delivered recipients/i);
    expect(result.recipients[0].email).toBe("ada@example.com");
  });

  it("lists skipped/failed issues with reason for newsletters", async () => {
    vi.mocked(CampaignSendModel.countDocuments).mockResolvedValue(2 as never);
    mockFindChain([
      {
        _id: { toString: () => "507f1f77bcf86cd799439023" },
        campaignStepId: { toString: () => "507f1f77bcf86cd799439031" },
        leadId: { toString: () => LEAD_ID },
        status: "skipped",
        error: "Missing email",
        providerError: null,
        bouncedAt: null,
        providerFailedAt: null,
        complainedAt: null,
        deliveryDelayedAt: null,
        sentAt: null,
        scheduledFor: new Date("2026-10-01T09:00:00.000Z"),
        createdAt: new Date("2026-10-01T09:00:00.000Z"),
      },
      {
        _id: { toString: () => "507f1f77bcf86cd799439024" },
        campaignStepId: { toString: () => "507f1f77bcf86cd799439031" },
        leadId: { toString: () => LEAD_ID },
        status: "failed",
        error: "SMTP timeout",
        providerError: null,
        bouncedAt: null,
        providerFailedAt: null,
        complainedAt: null,
        deliveryDelayedAt: null,
        sentAt: null,
        scheduledFor: new Date("2026-10-01T09:05:00.000Z"),
        createdAt: new Date("2026-10-01T09:05:00.000Z"),
      },
    ]);

    const result = await listCampaignAnalyticsIssuesForWorkspace(
      WORKSPACE_ID,
      CAMPAIGN_ID,
      {
        from: new Date("2026-09-01T00:00:00.000Z"),
        to: new Date("2026-10-03T00:00:00.000Z"),
        userId: "user-1",
      },
    );

    expect(result.issues).toHaveLength(2);
    expect(result.issues.map((issue) => issue.issueType).sort()).toEqual([
      "failed",
      "skipped",
    ]);
    expect(result.issues.find((issue) => issue.issueType === "skipped")?.reason).toBe(
      "Missing email",
    );
    expect(result.issues.find((issue) => issue.issueType === "failed")?.email).toBe(
      "ada@example.com",
    );
  });

  it("enforces project-scope campaign:read on engagement listing", async () => {
    vi.mocked(assertMultiProjectRecordAccess).mockRejectedValue(
      new AppError("PERMISSION_DENIED", "No access"),
    );

    await expect(
      listCampaignAnalyticsEngagementForWorkspace(WORKSPACE_ID, CAMPAIGN_ID, {
        partition: "opened",
        userId: "grant-user",
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("uses exclusive delayed match so bounced+delayed rows are not counted as delayed", async () => {
    vi.mocked(CampaignSendModel.countDocuments).mockResolvedValue(0 as never);
    mockFindChain([]);

    await listCampaignAnalyticsIssuesForWorkspace(WORKSPACE_ID, CAMPAIGN_ID, {
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-10-03T00:00:00.000Z"),
      userId: "user-1",
      issueType: "delayed",
    });

    expect(CampaignSendModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        deliveryDelayedAt: { $ne: null },
        bouncedAt: null,
        providerFailedAt: null,
        complainedAt: null,
      }),
    );
  });

  it("uses exclusive bounced match excluding complaints", async () => {
    vi.mocked(CampaignSendModel.countDocuments).mockResolvedValue(0 as never);
    mockFindChain([]);

    await listCampaignAnalyticsIssuesForWorkspace(WORKSPACE_ID, CAMPAIGN_ID, {
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-10-03T00:00:00.000Z"),
      userId: "user-1",
      issueType: "bounced",
    });

    expect(CampaignSendModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        bouncedAt: { $ne: null },
        complainedAt: null,
      }),
    );
  });

  it("returns cleartext email on newsletter issues only", async () => {
    vi.mocked(CampaignSendModel.countDocuments).mockResolvedValue(1 as never);
    mockFindChain([
      {
        _id: { toString: () => "507f1f77bcf86cd799439025" },
        campaignStepId: { toString: () => "507f1f77bcf86cd799439031" },
        leadId: { toString: () => LEAD_ID },
        status: "sent",
        error: null,
        providerError: "550 mailbox unavailable",
        bouncedAt: new Date("2026-10-01T09:12:00.000Z"),
        providerFailedAt: null,
        complainedAt: null,
        deliveryDelayedAt: null,
        sentAt: new Date("2026-10-01T09:00:00.000Z"),
        scheduledFor: new Date("2026-10-01T09:00:00.000Z"),
        createdAt: new Date("2026-10-01T09:00:00.000Z"),
      },
    ]);

    const newsletterResult = await listCampaignAnalyticsIssuesForWorkspace(
      WORKSPACE_ID,
      CAMPAIGN_ID,
      {
        from: new Date("2026-09-01T00:00:00.000Z"),
        to: new Date("2026-10-03T00:00:00.000Z"),
        userId: "user-1",
        issueType: "bounced",
      },
    );
    expect(newsletterResult.issues[0]?.email).toBe("ada@example.com");
    expect(newsletterResult.issues[0]?.emailMasked).toMatch(/@example\.com$/);

    vi.mocked(findCampaignById).mockResolvedValue({
      ...newsletter,
      kind: "drip",
    } as never);

    const dripResult = await listCampaignAnalyticsIssuesForWorkspace(
      WORKSPACE_ID,
      CAMPAIGN_ID,
      {
        from: new Date("2026-09-01T00:00:00.000Z"),
        to: new Date("2026-10-03T00:00:00.000Z"),
        userId: "user-1",
        issueType: "bounced",
      },
    );
    expect(dripResult.issues[0]?.email).toBeNull();
    expect(dripResult.issues[0]?.emailMasked).toMatch(/@example\.com$/);
  });
});
