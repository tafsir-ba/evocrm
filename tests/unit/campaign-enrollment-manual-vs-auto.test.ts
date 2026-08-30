import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildTestLeadRecord,
  campaignRecordExtras,
  campaignStepRecordExtras,
  enrollmentRecordExtras,
} from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/campaigns", () => ({
  findCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-steps", () => ({
  findFirstCampaignStep: vi.fn(),
  findCampaignSteps: vi.fn(),
  findStepByOrder: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-sends", () => ({
  findCampaignSendsByEnrollmentIds: vi.fn(),
}));

vi.mock("@/server/repositories/campaign-enrollments", () => ({
  createCampaignEnrollment: vi.fn(),
  findActiveEnrollmentByLead: vi.fn(),
  findActiveEnrollmentByOpportunity: vi.fn(),
  updateCampaignEnrollment: vi.fn(async (_ws, _id, patch) => patch),
  DuplicateCampaignEnrollmentError: class DuplicateCampaignEnrollmentError extends Error {},
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
  findLeads: vi.fn(),
}));

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn(),
}));

vi.mock("@/server/services/campaign-sending", () => ({
  sendCampaignEnrollmentsImmediately: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { createAuditLog } from "@/server/audit/create-audit-log";
import { findCampaignById } from "@/server/repositories/campaigns";
import {
  createCampaignEnrollment,
  findActiveEnrollmentByLead,
  updateCampaignEnrollment,
} from "@/server/repositories/campaign-enrollments";
import { findCampaignSendsByEnrollmentIds } from "@/server/repositories/campaign-sends";
import { findCampaignSteps, findFirstCampaignStep } from "@/server/repositories/campaign-steps";
import { findLeadById } from "@/server/repositories/leads";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import {
  createCampaignEnrollmentForWorkspace,
  enrollLeadInCampaignWithContext,
} from "@/server/services/campaign-enrollments";

const migratedLead = buildTestLeadRecord({
  id: "lead-migrated",
  attributes: {
    integration: {
      inboundSource: "hubspot-gv-pilot",
      idempotencyKey: "hubspot:contact:99",
    },
    campaignEnrollmentPolicy: {
      defaultExcluded: true,
      source: "hubspot_legacy_migration",
    },
  },
});

const activeCampaign = {
  id: "camp-1",
  workspaceId: "ws-1",
  name: "Drip",
  status: "active" as const,
  audienceType: "leads" as const,
  ...campaignRecordExtras,
  frequency: "manual",
  defaultFromName: null,
  createdBy: "user-1",
  ownerId: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const firstStep = {
  id: "step-1",
  workspaceId: "ws-1",
  campaignId: "camp-1",
  order: 1,
  delayDays: 1,
  sendTime: "09:00",
  subject: "Hello",
  ...campaignStepRecordExtras,
};

describe("manual vs automatic enrollment for migrated leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findCampaignById).mockResolvedValue(activeCampaign as never);
    vi.mocked(findLeadById).mockResolvedValue(migratedLead);
    vi.mocked(findActiveEnrollmentByLead).mockResolvedValue(null);
    vi.mocked(findFirstCampaignStep).mockResolvedValue(firstStep as never);
    vi.mocked(findCampaignSteps).mockResolvedValue([firstStep] as never);
    vi.mocked(findCampaignSendsByEnrollmentIds).mockResolvedValue([]);
    vi.mocked(findWorkspaceById).mockResolvedValue({ timezone: "UTC" } as never);
    const createdEnrollment = {
      id: "enroll-1",
      workspaceId: "ws-1",
      campaignId: "camp-1",
      leadId: "lead-migrated",
      opportunityId: null,
      status: "active" as const,
      currentStep: 1,
      nextSendAt: new Date("2099-01-01T00:00:00.000Z"),
      lastSentAt: null,
      completedAt: null,
      unsubscribedAt: null,
      failedAt: null,
      failureReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...enrollmentRecordExtras,
    };
    vi.mocked(createCampaignEnrollment).mockResolvedValue(createdEnrollment as never);
    vi.mocked(updateCampaignEnrollment).mockResolvedValue(createdEnrollment as never);
  });

  it("lets an authorized user deliberately enroll a migrated lead (manual + audit)", async () => {
    const enrollment = await createCampaignEnrollmentForWorkspace(
      "ws-1",
      "user-1",
      "camp-1",
      { leadId: "lead-migrated" },
    );

    expect(enrollment.id).toBe("enroll-1");
    expect(createCampaignEnrollment).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        leadId: "lead-migrated",
        enrollmentSource: "manual",
      }),
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "campaign_enrollment.created",
        entityId: "enroll-1",
      }),
    );
  });

  it("blocks automatic enrollment of a migrated lead", async () => {
    const result = await enrollLeadInCampaignWithContext({
      workspaceId: "ws-1",
      campaignId: "camp-1",
      leadId: "lead-migrated",
      actorId: "user-1",
      enrollmentSource: "rule_based_auto_enrollment",
    });

    expect(result).toBeNull();
    expect(createCampaignEnrollment).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "campaign.auto_enrollment_skipped",
        after: expect.objectContaining({ reason: "campaign_guard_migrated_lead" }),
      }),
    );
  });
});
