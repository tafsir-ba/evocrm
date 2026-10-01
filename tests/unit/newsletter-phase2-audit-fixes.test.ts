import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/campaigns", () => ({
  findCampaignById: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-enrollments", () => ({
  cancelEnrollmentsForCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/newsletter-audience-segments", () => ({
  replaceNewsletterAudienceSegments: vi.fn(),
  findNewsletterAudienceSegments: vi.fn(),
}));

vi.mock("@/server/repositories/import-jobs", () => ({
  findImportJobById: vi.fn(),
}));

vi.mock("@/server/repositories/tags", () => ({
  findTagById: vi.fn(),
}));

vi.mock("@/server/services/project-scope", () => ({
  validateActiveProjectId: vi.fn(),
}));

vi.mock("@/server/services/apply-project-scope", () => ({
  assertMultiProjectRecordAccess: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-sends", () => ({
  countCampaignSendsForCampaign: vi.fn(),
}));

import { findCampaignById, updateCampaign } from "@/server/repositories/campaigns";
import { findImportJobById } from "@/server/repositories/import-jobs";
import { replaceNewsletterAudienceSegments } from "@/server/repositories/newsletter-audience-segments";
import { validateActiveProjectId } from "@/server/services/project-scope";
import { assertMultiProjectRecordAccess } from "@/server/services/apply-project-scope";
import { countCampaignSendsForCampaign } from "@/server/repositories/campaign-sends";
import { replaceNewsletterSegmentsForWorkspace } from "@/server/services/newsletters";
import { AppError } from "@/server/errors";
import { campaignRecordExtras } from "@/tests/helpers/crm-fixtures";

describe("newsletter csv segment attach guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(countCampaignSendsForCampaign).mockResolvedValue(0);
    vi.mocked(assertMultiProjectRecordAccess).mockResolvedValue(undefined as never);
    vi.mocked(validateActiveProjectId).mockResolvedValue(undefined as never);
    vi.mocked(findCampaignById).mockResolvedValue({
      id: "camp-1",
      workspaceId: "ws-1",
      name: "NL",
      status: "draft",
      audienceType: "leads",
      ...campaignRecordExtras,
      kind: "newsletter",
      projectIds: ["507f1f77bcf86cd799439011"],
      audienceLockedAt: null,
      frequency: null,
      defaultFromName: "Evo",
      createdBy: "user-1",
      ownerId: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
  });

  it("rejects csv imports that were not started from this newsletter", async () => {
    vi.mocked(findImportJobById).mockResolvedValue({
      id: "507f1f77bcf86cd799439022",
      entityType: "lead",
      status: "completed",
      newsletterCampaignId: null,
    } as never);

    await expect(
      replaceNewsletterSegmentsForWorkspace("ws-1", "user-1", "camp-1", {
        segments: [
          {
            type: "csv_import",
            projectId: "507f1f77bcf86cd799439011",
            importJobId: "507f1f77bcf86cd799439022",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(replaceNewsletterAudienceSegments).not.toHaveBeenCalled();
  });

  it("accepts csv imports scoped to this newsletter", async () => {
    vi.mocked(findImportJobById).mockResolvedValue({
      id: "507f1f77bcf86cd799439022",
      entityType: "lead",
      status: "completed",
      newsletterCampaignId: "camp-1",
    } as never);
    vi.mocked(updateCampaign).mockResolvedValue({} as never);
    vi.mocked(replaceNewsletterAudienceSegments).mockResolvedValue([
      {
        id: "seg-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        type: "csv_import",
        order: 1,
        projectId: "507f1f77bcf86cd799439011",
        tagIds: [],
        tagMatch: "any",
        importJobId: "507f1f77bcf86cd799439022",
        applyTagId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const segments = await replaceNewsletterSegmentsForWorkspace(
      "ws-1",
      "user-1",
      "camp-1",
      {
        segments: [
          {
            type: "csv_import",
            projectId: "507f1f77bcf86cd799439011",
            importJobId: "507f1f77bcf86cd799439022",
          },
        ],
      },
    );

    expect(segments).toHaveLength(1);
    expect(replaceNewsletterAudienceSegments).toHaveBeenCalled();
  });
});
