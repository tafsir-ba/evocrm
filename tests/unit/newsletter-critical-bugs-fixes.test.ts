import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/server/errors";
import { campaignRecordExtras } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/campaigns", () => ({
  findCampaignById: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-steps", () => ({
  countCampaignSteps: vi.fn().mockResolvedValue(1),
  syncCampaignStepFromNames: vi.fn(),
  findCampaignSteps: vi.fn().mockResolvedValue([]),
  findCampaignStepById: vi.fn(),
  findFirstCampaignStep: vi.fn(),
  createCampaignStep: vi.fn(),
  updateCampaignStep: vi.fn(),
  reorderCampaignSteps: vi.fn(),
  deleteCampaignStep: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-enrollments", () => ({
  countCampaignEnrollments: vi.fn().mockResolvedValue(0),
  countActiveSendClaimsForCampaign: vi.fn(),
  pauseEnrollmentsForCampaign: vi.fn(),
  resumeEnrollmentsForCampaign: vi.fn(),
  cancelEnrollmentsForCampaign: vi.fn(),
  createCampaignEnrollmentsBulk: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-sends", () => ({
  countCampaignSendsForCampaign: vi.fn(),
  findCampaignSends: vi.fn().mockResolvedValue({ sends: [], total: 0 }),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/services/campaign-readiness", () => ({
  assertCampaignLaunchReady: vi.fn(),
}));

vi.mock("@/server/services/campaign-sending", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/services/campaign-sending")>();
  return {
    ...actual,
    sendCampaignEnrollmentsImmediately: vi.fn().mockResolvedValue({
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      deferred: 0,
    }),
  };
});

vi.mock("@/server/services/campaign-enrollments", () => ({
  rescheduleActiveEnrollmentSendsForCampaign: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/server/services/assignments", () => ({
  validateOptionalAssignableMember: vi.fn(),
}));

vi.mock("@/server/services/project-scope", () => ({
  validateActiveProjectId: vi.fn(),
}));

vi.mock("@/server/services/apply-project-scope", () => ({
  applyUserProjectScope: vi.fn(async (_ws, _user, filter) => filter),
  assertMultiProjectRecordAccess: vi.fn(),
}));

vi.mock("@/server/services/sending-domains", () => ({
  assertVerifiedSenderEmail: vi.fn(),
}));

vi.mock("@/server/repositories/newsletter-audience-segments", () => ({
  findNewsletterAudienceSegments: vi.fn().mockResolvedValue([]),
  replaceNewsletterAudienceSegments: vi.fn(),
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn().mockResolvedValue({
    id: "ws-1",
    name: "Workspace",
    slug: "demo",
    type: "agency",
    timezone: "UTC",
    defaultCurrency: "USD",
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
}));

vi.mock("@/server/services/newsletter-audience", () => ({
  resolveNewsletterAudience: vi.fn(),
  assertNewsletterAudienceSendable: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
}));

import {
  findCampaignById,
  updateCampaign,
} from "@/server/repositories/campaigns";
import {
  cancelEnrollmentsForCampaign,
  countActiveSendClaimsForCampaign,
  createCampaignEnrollmentsBulk,
} from "@/server/repositories/campaign-enrollments";
import { countCampaignSendsForCampaign } from "@/server/repositories/campaign-sends";
import {
  countCampaignSteps,
  findFirstCampaignStep,
} from "@/server/repositories/campaign-steps";
import { assertMultiProjectRecordAccess } from "@/server/services/apply-project-scope";
import { assertCampaignLaunchReady } from "@/server/services/campaign-readiness";
import {
  resolveNewsletterAudience,
  assertNewsletterAudienceSendable,
} from "@/server/services/newsletter-audience";
import {
  cancelNewsletterScheduleForWorkspace,
  hasNewsletterSendStarted,
  sendNewsletterNowForWorkspace,
} from "@/server/services/newsletters";
import { updateCampaignForWorkspace } from "@/server/services/campaigns";
import { updateCampaignStepForWorkspace } from "@/server/services/campaign-steps";
import { resolveCampaignAnalyticsPeriod } from "@/server/services/campaign-analytics";
import {
  listCampaignSendsForWorkspace,
  sendCampaignEnrollmentsImmediately,
} from "@/server/services/campaign-sending";

const projectId = "507f1f77bcf86cd799439011";

const newsletter = {
  id: "camp-nl-1",
  workspaceId: "ws-1",
  name: "Spring NL",
  status: "draft" as const,
  audienceType: "leads" as const,
  ...campaignRecordExtras,
  kind: "newsletter" as const,
  projectIds: [projectId],
  frequency: null,
  defaultFromName: "Evo",
  senderName: "Evo",
  senderEmail: "news@example.com",
  sendingDomainId: "domain-1",
  createdBy: "user-1",
  ownerId: null,
  archivedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date(),
};

const firstStep = {
  id: "step-1",
  workspaceId: "ws-1",
  campaignId: "camp-nl-1",
  order: 1,
  name: "Newsletter",
  delayDays: 0,
  delayAmount: 0,
  delayUnit: "days" as const,
  sendTime: "09:00",
  fromName: "Evo",
  channel: "email" as const,
  status: "ready" as const,
  contentMode: "html" as const,
  subject: "Hello",
  previewText: null,
  body: "<p>Hi</p>",
  bodyHtml: "<p>Hi</p>",
  bodyText: "Hi",
  documentIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const audienceResult = {
  included: [
    {
      leadId: "lead-1",
      projectId,
      segmentIds: ["seg-1"],
      email: "a@example.com",
      consentStatus: "subscribed" as const,
    },
    {
      leadId: "lead-2",
      projectId,
      segmentIds: ["seg-1"],
      email: "b@example.com",
      consentStatus: "subscribed" as const,
    },
  ],
  excluded: [],
  summary: {
    queued: 2,
    excludedMissingEmail: 0,
    excludedUnsubscribed: 0,
    excludedSuppressed: 0,
    excludedInvalid: 0,
    excludedArchived: 0,
    excludedUnknownConsent: 0,
    unknownConsent: 0,
    deduped: 0,
  },
};

describe("newsletter critical bugs fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findCampaignById).mockResolvedValue(newsletter);
    vi.mocked(updateCampaign).mockImplementation(async (_ws, _id, input) => ({
      ...newsletter,
      ...input,
    }));
    vi.mocked(countCampaignSendsForCampaign).mockResolvedValue(0);
    vi.mocked(countActiveSendClaimsForCampaign).mockResolvedValue(0);
    vi.mocked(countCampaignSteps).mockResolvedValue(1);
    vi.mocked(assertMultiProjectRecordAccess).mockResolvedValue(undefined as never);
    vi.mocked(assertCampaignLaunchReady).mockResolvedValue(undefined as never);
    vi.mocked(assertNewsletterAudienceSendable).mockReturnValue(undefined as never);
    vi.mocked(resolveNewsletterAudience).mockResolvedValue(audienceResult as never);
    vi.mocked(findFirstCampaignStep).mockResolvedValue(firstStep as never);
    vi.mocked(createCampaignEnrollmentsBulk).mockImplementation(async (_ws, inputs) => inputs.length);
    vi.mocked(cancelEnrollmentsForCampaign).mockResolvedValue(0);
    vi.mocked(sendCampaignEnrollmentsImmediately).mockResolvedValue({
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      deferred: 0,
    });
  });

  describe("P0 claim-aware send-started fence", () => {
    it("treats unexpired send claims as send-started", async () => {
      vi.mocked(countActiveSendClaimsForCampaign).mockResolvedValue(1);
      vi.mocked(countCampaignSendsForCampaign).mockResolvedValue(0);

      await expect(hasNewsletterSendStarted("ws-1", "camp-nl-1")).resolves.toBe(true);
      expect(countActiveSendClaimsForCampaign).toHaveBeenCalledWith("ws-1", "camp-nl-1");
    });

    it("cancel fails closed while claims exist with clear error", async () => {
      vi.mocked(findCampaignById).mockResolvedValue({
        ...newsletter,
        status: "active",
        audienceLockedAt: new Date(),
        scheduledFor: new Date(),
      });
      vi.mocked(countActiveSendClaimsForCampaign).mockResolvedValue(2);

      await expect(
        cancelNewsletterScheduleForWorkspace("ws-1", "user-1", "camp-nl-1"),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("currently sending"),
      });

      expect(cancelEnrollmentsForCampaign).not.toHaveBeenCalled();
      expect(updateCampaign).not.toHaveBeenCalled();
    });

    it("cancel fails closed if claims remain after enrollment cancel", async () => {
      vi.mocked(findCampaignById).mockResolvedValue({
        ...newsletter,
        status: "active",
        audienceLockedAt: new Date(),
        scheduledFor: new Date(),
      });
      vi.mocked(countActiveSendClaimsForCampaign)
        .mockResolvedValueOnce(0) // mutable gate
        .mockResolvedValueOnce(0) // pre-cancel assert
        .mockResolvedValueOnce(1); // post-cancel recheck
      vi.mocked(cancelEnrollmentsForCampaign).mockResolvedValue(1);

      await expect(
        cancelNewsletterScheduleForWorkspace("ws-1", "user-1", "camp-nl-1"),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("currently sending"),
      });

      expect(cancelEnrollmentsForCampaign).toHaveBeenCalled();
      expect(updateCampaign).not.toHaveBeenCalled();
    });

    it("re-lock / send-now refuses while claims are in flight", async () => {
      vi.mocked(findCampaignById).mockResolvedValue({
        ...newsletter,
        status: "active",
        audienceLockedAt: new Date(),
      });
      vi.mocked(countActiveSendClaimsForCampaign).mockResolvedValue(1);

      await expect(
        sendNewsletterNowForWorkspace("ws-1", "user-1", "camp-nl-1"),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("currently sending"),
      });

      expect(createCampaignEnrollmentsBulk).not.toHaveBeenCalled();
    });
  });

  describe("P1 lock durability", () => {
    it("soft-locks before insert, always cancels orphans, asserts insert count", async () => {
      const calls: string[] = [];
      vi.mocked(updateCampaign).mockImplementation(async (_ws, _id, input) => {
        if (input.audienceLockedAt && !input.status) {
          calls.push("soft-lock");
        }
        if (input.status === "active") {
          calls.push("activate");
        }
        return { ...newsletter, ...input, status: input.status ?? newsletter.status };
      });
      vi.mocked(cancelEnrollmentsForCampaign).mockImplementation(async () => {
        calls.push("cancel");
        return 0;
      });
      vi.mocked(createCampaignEnrollmentsBulk).mockImplementation(async (_ws, inputs) => {
        calls.push("insert");
        return inputs.length;
      });

      await sendNewsletterNowForWorkspace("ws-1", "user-1", "camp-nl-1");

      expect(calls).toEqual(["soft-lock", "cancel", "insert", "activate"]);
      expect(cancelEnrollmentsForCampaign).toHaveBeenCalledWith(
        "ws-1",
        "camp-nl-1",
        "Newsletter audience re-locked before send.",
      );
      expect(createCampaignEnrollmentsBulk).toHaveBeenCalled();
    });

    it("fails lock when inserted count mismatches resolved audience", async () => {
      vi.mocked(createCampaignEnrollmentsBulk).mockResolvedValue(1);

      await expect(
        sendNewsletterNowForWorkspace("ws-1", "user-1", "camp-nl-1"),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("enrollment count mismatch"),
      });
    });

    it("cancels orphans even when audience was never locked", async () => {
      vi.mocked(findCampaignById).mockResolvedValue({
        ...newsletter,
        audienceLockedAt: null,
        status: "draft",
      });

      await sendNewsletterNowForWorkspace("ws-1", "user-1", "camp-nl-1");

      expect(cancelEnrollmentsForCampaign).toHaveBeenCalled();
    });
  });

  describe("P1 project scope — analytics / sends", () => {
    it("denies analytics for grant-only foreign projectIds", async () => {
      vi.mocked(assertMultiProjectRecordAccess).mockRejectedValue(
        new AppError("PERMISSION_DENIED", "You do not have access to this project."),
      );

      await expect(
        resolveCampaignAnalyticsPeriod("ws-1", "camp-nl-1", {
          period: "30d",
          userId: "grant-user",
        }),
      ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

      expect(assertMultiProjectRecordAccess).toHaveBeenCalledWith(
        "ws-1",
        "grant-user",
        [projectId],
        "campaign:read",
      );
    });

    it("denies sends list for grant-only foreign projectIds", async () => {
      vi.mocked(assertMultiProjectRecordAccess).mockRejectedValue(
        new AppError("PERMISSION_DENIED", "You do not have access to this project."),
      );

      await expect(
        listCampaignSendsForWorkspace("ws-1", "camp-nl-1", {
          userId: "grant-user",
        }),
      ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

      expect(assertMultiProjectRecordAccess).toHaveBeenCalledWith(
        "ws-1",
        "grant-user",
        [projectId],
        "campaign:read",
      );
    });
  });

  describe("P1 project scope — campaign/step mutate", () => {
    it("denies campaign PATCH for grant-only foreign projectIds", async () => {
      vi.mocked(assertMultiProjectRecordAccess).mockRejectedValue(
        new AppError("PERMISSION_DENIED", "You do not have access to this project."),
      );

      await expect(
        updateCampaignForWorkspace("ws-1", "grant-user", "camp-nl-1", {
          name: "Hijacked",
        }),
      ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

      expect(assertMultiProjectRecordAccess).toHaveBeenCalledWith(
        "ws-1",
        "grant-user",
        [projectId],
        "campaign:update",
      );
      expect(updateCampaign).not.toHaveBeenCalled();
    });

    it("denies step PATCH for grant-only foreign projectIds", async () => {
      vi.mocked(assertMultiProjectRecordAccess).mockRejectedValue(
        new AppError("PERMISSION_DENIED", "You do not have access to this project."),
      );

      await expect(
        updateCampaignStepForWorkspace("ws-1", "grant-user", "camp-nl-1", "step-1", {
          subject: "Hijacked",
        }),
      ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

      expect(assertMultiProjectRecordAccess).toHaveBeenCalledWith(
        "ws-1",
        "grant-user",
        [projectId],
        "campaign:update",
      );
    });
  });
});
