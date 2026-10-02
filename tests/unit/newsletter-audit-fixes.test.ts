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
  countActiveSendClaimsForCampaign: vi.fn().mockResolvedValue(0),
  pauseEnrollmentsForCampaign: vi.fn(),
  resumeEnrollmentsForCampaign: vi.fn(),
  cancelEnrollmentsForCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-sends", () => ({
  countCampaignSendsForCampaign: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/services/campaign-readiness", () => ({
  assertCampaignLaunchReady: vi.fn(),
}));

vi.mock("@/server/services/campaign-sending", () => ({
  sendCampaignEnrollmentsImmediately: vi.fn(),
}));

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
  findWorkspaceById: vi.fn(),
}));

vi.mock("@/server/services/newsletter-audience", () => ({
  resolveNewsletterAudience: vi.fn(),
  assertNewsletterAudienceSendable: vi.fn(),
}));

import {
  findCampaignById,
  updateCampaign,
} from "@/server/repositories/campaigns";
import { countCampaignSendsForCampaign } from "@/server/repositories/campaign-sends";
import {
  cancelEnrollmentsForCampaign,
  countActiveSendClaimsForCampaign,
} from "@/server/repositories/campaign-enrollments";
import { assertMultiProjectRecordAccess } from "@/server/services/apply-project-scope";
import { updateCampaignForWorkspace } from "@/server/services/campaigns";
import { cancelNewsletterScheduleForWorkspace } from "@/server/services/newsletters";
import {
  duplicateCampaignStepForWorkspace,
  reorderCampaignStepsForWorkspace,
} from "@/server/services/campaign-steps";

const newsletter = {
  id: "camp-nl-1",
  workspaceId: "ws-1",
  name: "Spring NL",
  status: "draft" as const,
  audienceType: "leads" as const,
  ...campaignRecordExtras,
  kind: "newsletter" as const,
  frequency: null,
  defaultFromName: "Evo",
  createdBy: "user-1",
  ownerId: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("newsletter audit P0/P1 guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findCampaignById).mockResolvedValue(newsletter);
    vi.mocked(updateCampaign).mockImplementation(async (_ws, _id, input) => ({
      ...newsletter,
      ...input,
    }));
    vi.mocked(countCampaignSendsForCampaign).mockResolvedValue(0);
    vi.mocked(countActiveSendClaimsForCampaign).mockResolvedValue(0);
  });

  it("rejects enabling auto-enrollment on a newsletter", async () => {
    await expect(
      updateCampaignForWorkspace("ws-1", "user-1", "camp-nl-1", {
        autoEnrollmentEnabled: true,
        enrollmentTrigger: "new_lead",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("automatic enrollment"),
    });
    expect(updateCampaign).not.toHaveBeenCalled();
  });

  it("rejects direct projectIds updates on newsletters", async () => {
    await expect(
      updateCampaignForWorkspace("ws-1", "user-1", "camp-nl-1", {
        projectIds: ["507f1f77bcf86cd799439011"],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("audience segments"),
    });
  });

  it("rejects duplicating a newsletter step", async () => {
    await expect(
      duplicateCampaignStepForWorkspace("ws-1", "user-1", "camp-nl-1", "step-1"),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("single email step"),
    });
  });

  it("rejects reordering newsletter steps", async () => {
    await expect(
      reorderCampaignStepsForWorkspace("ws-1", "user-1", "camp-nl-1", {
        stepIds: ["step-1"],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("reordered"),
    });
  });

  it("cancel schedule asserts project access and blocks after send started", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...newsletter,
      status: "active",
      audienceLockedAt: new Date(),
      scheduledFor: new Date(),
      projectIds: ["507f1f77bcf86cd799439011"],
    });
    vi.mocked(countCampaignSendsForCampaign).mockResolvedValue(1);

    await expect(
      cancelNewsletterScheduleForWorkspace("ws-1", "user-1", "camp-nl-1"),
    ).rejects.toBeInstanceOf(AppError);

    expect(assertMultiProjectRecordAccess).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      ["507f1f77bcf86cd799439011"],
      "campaign:update",
    );
    expect(cancelEnrollmentsForCampaign).not.toHaveBeenCalled();
  });
});
