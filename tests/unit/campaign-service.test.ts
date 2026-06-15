import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/campaigns", () => ({
  createCampaign: vi.fn(),
  findCampaignById: vi.fn(),
  findCampaigns: vi.fn(),
  archiveCampaign: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-steps", () => ({
  countCampaignSteps: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-enrollments", () => ({
  countCampaignEnrollments: vi.fn(),
  pauseEnrollmentsForCampaign: vi.fn(),
  resumeEnrollmentsForCampaign: vi.fn(),
  cancelEnrollmentsForCampaign: vi.fn(),
}));

vi.mock("@/server/services/campaign-enrollments", () => ({
  rescheduleActiveEnrollmentSendsForCampaign: vi.fn(),
}));

vi.mock("@/server/services/campaign-sending", () => ({
  sendCampaignEnrollmentsImmediately: vi.fn(),
}));

vi.mock("@/server/repositories/memberships", () => ({
  findMembership: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import {
  archiveCampaign,
  createCampaign,
  findCampaignById,
  findCampaigns,
  updateCampaign,
} from "@/server/repositories/campaigns";
import { countCampaignEnrollments, cancelEnrollmentsForCampaign, pauseEnrollmentsForCampaign, resumeEnrollmentsForCampaign } from "@/server/repositories/campaign-enrollments";
import { rescheduleActiveEnrollmentSendsForCampaign } from "@/server/services/campaign-enrollments";
import { sendCampaignEnrollmentsImmediately } from "@/server/services/campaign-sending";
import { countCampaignSteps } from "@/server/repositories/campaign-steps";
import {
  archiveCampaignForWorkspace,
  createCampaignForWorkspace,
  pauseCampaignForWorkspace,
  updateCampaignForWorkspace,
} from "@/server/services/campaigns";
import { AppError } from "@/server/errors";

const baseCampaign = {
  id: "camp-1",
  workspaceId: "ws-1",
  name: "Buyer Follow-up",
  status: "draft" as const,
  audienceType: "leads" as const,
  frequency: "manual",
  defaultFromName: null,
  createdBy: "user-1",
  ownerId: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("campaign service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(countCampaignSteps).mockResolvedValue(0);
    vi.mocked(countCampaignEnrollments).mockResolvedValue(0);
    vi.mocked(rescheduleActiveEnrollmentSendsForCampaign).mockResolvedValue([]);
    vi.mocked(sendCampaignEnrollmentsImmediately).mockResolvedValue({
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    });
  });

  it("create sets workspaceId and createdBy server-side", async () => {
    vi.mocked(createCampaign).mockResolvedValue(baseCampaign);

    const result = await createCampaignForWorkspace("ws-1", "user-1", {
      name: "Buyer Follow-up",
      audienceType: "leads",
      frequency: "manual",
    });

    expect(createCampaign).toHaveBeenCalledWith("ws-1", {
      name: "Buyer Follow-up",
      audienceType: "leads",
      frequency: "manual",
      defaultFromName: null,
      createdBy: "user-1",
      ownerId: null,
    });
    expect(result.id).toBe("camp-1");
  });

  it("archive sets status=archived and archivedAt", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...baseCampaign,
      status: "active",
    });
    vi.mocked(archiveCampaign).mockResolvedValue({
      ...baseCampaign,
      status: "archived",
      archivedAt: new Date(),
    });

    const result = await archiveCampaignForWorkspace("ws-1", "user-1", "camp-1");

    expect(archiveCampaign).toHaveBeenCalledWith("ws-1", "camp-1");
    expect(cancelEnrollmentsForCampaign).toHaveBeenCalledWith(
      "ws-1",
      "camp-1",
      "Campaign archived.",
    );
    expect(result.status).toBe("archived");
    expect(result.archivedAt).not.toBeNull();
  });

  it("excludes archived campaigns by default in list filter", async () => {
    vi.mocked(findCampaigns).mockResolvedValue({ campaigns: [baseCampaign], total: 1 });

    await import("@/server/services/campaigns").then((m) =>
      m.listCampaignsForWorkspace("ws-1", { includeArchived: false }),
    );

    expect(findCampaigns).toHaveBeenCalledWith("ws-1", { includeArchived: false });
  });

  it("pause only works on active campaigns", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...baseCampaign,
      status: "draft",
    });

    await expect(
      pauseCampaignForWorkspace("ws-1", "user-1", "camp-1"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("update to paused pauses active enrollments", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...baseCampaign,
      status: "active",
    });
    vi.mocked(updateCampaign).mockResolvedValue({
      ...baseCampaign,
      status: "paused",
    });

    await updateCampaignForWorkspace("ws-1", "user-1", "camp-1", { status: "paused" });

    expect(pauseEnrollmentsForCampaign).toHaveBeenCalledWith("ws-1", "camp-1");
  });

  it("rejects updates to archived campaigns", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...baseCampaign,
      status: "archived",
      archivedAt: new Date(),
    });

    await expect(
      updateCampaignForWorkspace("ws-1", "user-1", "camp-1", { name: "Renamed" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Archived campaigns cannot be edited. Restore the campaign first.",
    });

    expect(updateCampaign).not.toHaveBeenCalled();
  });

  it("update to active from paused resumes enrollments and requires steps", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...baseCampaign,
      status: "paused",
    });
    vi.mocked(countCampaignSteps).mockResolvedValue(1);
    vi.mocked(updateCampaign).mockResolvedValue({
      ...baseCampaign,
      status: "active",
    });

    await updateCampaignForWorkspace("ws-1", "user-1", "camp-1", { status: "active" });

    expect(resumeEnrollmentsForCampaign).toHaveBeenCalledWith("ws-1", "camp-1");
  });

  it("rejects activation without steps", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...baseCampaign,
      status: "draft",
    });
    vi.mocked(countCampaignSteps).mockResolvedValue(0);

    await expect(
      updateCampaignForWorkspace("ws-1", "user-1", "camp-1", { status: "active" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("activation from draft reschedules pending sends and triggers immediate processing", async () => {
    vi.mocked(findCampaignById).mockResolvedValue({
      ...baseCampaign,
      status: "draft",
    });
    vi.mocked(countCampaignSteps).mockResolvedValue(1);
    vi.mocked(updateCampaign).mockResolvedValue({
      ...baseCampaign,
      status: "active",
    });
    vi.mocked(rescheduleActiveEnrollmentSendsForCampaign).mockResolvedValue(["enroll-1"]);

    await updateCampaignForWorkspace("ws-1", "user-1", "camp-1", { status: "active" });

    expect(rescheduleActiveEnrollmentSendsForCampaign).toHaveBeenCalledWith(
      "ws-1",
      "camp-1",
      expect.any(Date),
      "activation",
    );
    expect(sendCampaignEnrollmentsImmediately).toHaveBeenCalledWith(
      "ws-1",
      "camp-1",
      "activation",
      ["enroll-1"],
    );
  });
});
