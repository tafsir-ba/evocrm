import { beforeEach, describe, expect, it, vi } from "vitest";

import { enrollmentRecordExtras, leadRecordExtras } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
  updateLead: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-enrollments", () => ({
  findEnrollmentByIdOnly: vi.fn(),
  updateCampaignEnrollment: vi.fn(),
}));

vi.mock("@/server/repositories/email-suppressions", () => ({
  upsertEmailSuppression: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findEnrollmentByIdOnly } from "@/server/repositories/campaign-enrollments";
import { findLeadById, updateLead } from "@/server/repositories/leads";
import { processUnsubscribe } from "@/server/services/unsubscribe";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/server/utils/unsubscribe-token";
import { resetEnvCacheForTests } from "@/server/env";

describe("unsubscribe service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnvCacheForTests();
    process.env.NEXTAUTH_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.MONGODB_URI = "mongodb://localhost:27017/evocrm";
  });

  it("token marks lead and enrollment unsubscribed", async () => {
    const token = createUnsubscribeToken({
      workspaceId: "ws-1",
      leadId: "lead-1",
      enrollmentId: "enroll-1",
      campaignId: "camp-1",
    });

    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
  ...leadRecordExtras,
      statusId: "s1",
      sourceId: null,
      ownerId: null,
      assignedTo: null,
      firstName: "Jane",
      lastName: "Doe",
      fullName: "Jane Doe",
      email: "jane@example.com",
      emailNormalized: "jane@example.com",
      phone: null,
      phoneNormalized: null,
      language: null,
      preferredContactMethod: null,
      budgetMin: null,
      budgetMax: null,
      preferredAreas: [],
  propertyTypeInterests: [],
  transactionIntent: null,
  usagePurpose: null,
      notes: null,
      tags: [],
      attributes: {},
      emailConsentStatus: "unknown",
      emailUnsubscribedAt: null,
      emailUnsubscribeReason: null,
      lastContactedAt: null,
      createdBy: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(findEnrollmentByIdOnly).mockResolvedValue({
      id: "enroll-1",
      workspaceId: "ws-1",
      campaignId: "camp-1",
      leadId: "lead-1",
      opportunityId: null,
      ...enrollmentRecordExtras,
      status: "active",
      currentStep: 1,
      nextSendAt: new Date(),
      lastSentAt: null,
      completedAt: null,
      unsubscribedAt: null,
      failedAt: null,
      failureReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await processUnsubscribe(token);

    expect(result.success).toBe(true);
    expect(updateLead).toHaveBeenCalledWith(
      "ws-1",
      "lead-1",
      expect.objectContaining({
        emailConsentStatus: "unsubscribed",
        emailUnsubscribedAt: expect.any(Date),
      }),
    );
  });

  it("rejects invalid token", () => {
    expect(() => verifyUnsubscribeToken("bad.token")).toThrow();
  });
});
