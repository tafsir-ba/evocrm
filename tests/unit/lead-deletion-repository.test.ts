import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/server/storage/spaces", () => ({
  deleteObject: vi.fn(),
}));

vi.mock("@/models/opportunity", () => ({
  OpportunityModel: { find: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock("@/models/campaign-enrollment", () => ({
  CampaignEnrollmentModel: { find: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock("@/models/campaign-send", () => ({
  CampaignSendModel: { deleteMany: vi.fn() },
}));

vi.mock("@/models/document", () => ({
  DocumentModel: { find: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock("@/models/activity", () => ({
  ActivityModel: { deleteMany: vi.fn() },
}));

vi.mock("@/models/import-row-result", () => ({
  ImportRowResultModel: { deleteMany: vi.fn() },
}));

vi.mock("@/models/lead", () => ({
  LeadModel: { deleteMany: vi.fn() },
}));

vi.mock("@/models/lead-project-membership", () => ({
  LeadProjectMembershipModel: { deleteMany: vi.fn() },
}));

import { ActivityModel } from "@/models/activity";
import { CampaignEnrollmentModel } from "@/models/campaign-enrollment";
import { CampaignSendModel } from "@/models/campaign-send";
import { DocumentModel } from "@/models/document";
import { ImportRowResultModel } from "@/models/import-row-result";
import { LeadModel } from "@/models/lead";
import { LeadProjectMembershipModel } from "@/models/lead-project-membership";
import { OpportunityModel } from "@/models/opportunity";
import { purgeLeadsByIds } from "@/server/repositories/lead-deletion";

describe("lead deletion repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(OpportunityModel.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: "opp-1" }]),
      }),
    } as never);
    vi.mocked(CampaignEnrollmentModel.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: "enroll-1" }]),
      }),
    } as never);
    vi.mocked(DocumentModel.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    } as never);
    vi.mocked(CampaignSendModel.deleteMany).mockResolvedValue({ deletedCount: 1 } as never);
    vi.mocked(CampaignEnrollmentModel.deleteMany).mockResolvedValue({ deletedCount: 1 } as never);
    vi.mocked(DocumentModel.deleteMany).mockResolvedValue({ deletedCount: 0 } as never);
    vi.mocked(ActivityModel.deleteMany).mockResolvedValue({ deletedCount: 0 } as never);
    vi.mocked(OpportunityModel.deleteMany).mockResolvedValue({ deletedCount: 1 } as never);
    vi.mocked(ImportRowResultModel.deleteMany).mockResolvedValue({ deletedCount: 2 } as never);
    vi.mocked(LeadModel.deleteMany).mockResolvedValue({ deletedCount: 1 } as never);
    vi.mocked(LeadProjectMembershipModel.deleteMany).mockResolvedValue({
      deletedCount: 1,
    } as never);
  });

  it("deletes opportunity-linked enrollments and import row results", async () => {
    const deletedCount = await purgeLeadsByIds("507f1f77bcf86cd799439011", [
      "507f1f77bcf86cd799439012",
    ]);

    expect(CampaignEnrollmentModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "507f1f77bcf86cd799439011",
        $or: expect.arrayContaining([
          expect.objectContaining({ leadId: expect.any(Object) }),
          expect.objectContaining({ opportunityId: expect.any(Object) }),
        ]),
      }),
    );
    expect(CampaignEnrollmentModel.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "507f1f77bcf86cd799439011",
        $or: expect.arrayContaining([
          expect.objectContaining({ leadId: expect.any(Object) }),
          expect.objectContaining({ opportunityId: expect.any(Object) }),
        ]),
      }),
    );
    expect(ImportRowResultModel.deleteMany).toHaveBeenCalledWith({
      workspaceId: expect.any(Object),
      entityId: { $in: ["507f1f77bcf86cd799439012"] },
    });
    expect(deletedCount).toBe(1);
  });
});
