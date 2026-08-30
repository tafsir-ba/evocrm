import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadRecord } from "@/server/repositories/leads";
import {
  evaluateEnrollmentConditions,
  logAutoEnrollmentFailure,
  parseCustomFieldCondition,
  scheduleCampaignAutoEnrollmentForLead,
} from "@/server/services/campaign-auto-enrollment";
import { TEST_PROJECT_ID } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/observability/capture-error", () => ({
  captureError: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
}));

vi.mock("@/server/repositories/campaigns", () => ({
  findActiveAutoEnrollmentCampaigns: vi.fn(),
}));

vi.mock("@/server/services/campaign-enrollments", () => ({
  enrollLeadInCampaignWithContext: vi.fn(),
}));

import { createAuditLog } from "@/server/audit/create-audit-log";
import { captureError } from "@/server/observability/capture-error";
import { findActiveAutoEnrollmentCampaigns } from "@/server/repositories/campaigns";
import { findLeadById } from "@/server/repositories/leads";
import { enrollLeadInCampaignWithContext } from "@/server/services/campaign-enrollments";

function buildLead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: "lead-1",
    workspaceId: "ws-1",
    projectId: TEST_PROJECT_ID,
    statusId: "status-1",
    sourceId: "source-1",
    ownerId: null,
    assignedTo: "user-1",
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
    tags: ["tag-1"],
    attributes: { investor: "yes", notes: "" },
    emailConsentStatus: "unknown",
    emailUnsubscribedAt: null,
    emailUnsubscribeReason: null,
    lastContactedAt: null,
    createdBy: "user-1",
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("parseCustomFieldCondition", () => {
  it("parses structured custom field key and expected value", () => {
    expect(
      parseCustomFieldCondition({
        field: "customField",
        operator: "equals",
        value: "yes",
        customFieldKey: "investor",
      }),
    ).toEqual({
      key: "investor",
      expectedValue: "yes",
    });
  });

  it("parses legacy field_key:expected syntax", () => {
    expect(
      parseCustomFieldCondition({
        field: "customField",
        operator: "equals",
        value: "investor:yes",
      }),
    ).toEqual({
      key: "investor",
      expectedValue: "yes",
    });
  });
});

describe("evaluateEnrollmentConditions", () => {
  it("enrolls all leads when conditions are empty", () => {
    expect(
      evaluateEnrollmentConditions({
        lead: buildLead(),
        conditions: [],
        logic: "AND",
      }),
    ).toBe(true);
  });

  it("matches project, source, status, and assigned user with AND logic", () => {
    const lead = buildLead();

    expect(
      evaluateEnrollmentConditions({
        lead,
        logic: "AND",
        conditions: [
          { field: "projectId", operator: "equals", value: TEST_PROJECT_ID },
          { field: "sourceId", operator: "equals", value: "source-1" },
          { field: "statusId", operator: "equals", value: "status-1" },
          { field: "assignedTo", operator: "equals", value: "user-1" },
        ],
      }),
    ).toBe(true);
  });

  it("supports OR logic for mixed conditions", () => {
    const lead = buildLead({ sourceId: "other-source" });

    expect(
      evaluateEnrollmentConditions({
        lead,
        logic: "OR",
        conditions: [
          { field: "sourceId", operator: "equals", value: "source-1" },
          { field: "projectId", operator: "equals", value: TEST_PROJECT_ID },
        ],
      }),
    ).toBe(true);
  });

  it("matches tag contains and rejects when tag is missing", () => {
    const lead = buildLead();

    expect(
      evaluateEnrollmentConditions({
        lead,
        logic: "AND",
        conditions: [{ field: "tags", operator: "contains", value: "tag-1" }],
      }),
    ).toBe(true);

    expect(
      evaluateEnrollmentConditions({
        lead: buildLead({ tags: [] }),
        logic: "AND",
        conditions: [{ field: "tags", operator: "contains", value: "tag-1" }],
      }),
    ).toBe(false);
  });

  it("matches structured custom-field equals", () => {
    expect(
      evaluateEnrollmentConditions({
        lead: buildLead(),
        logic: "AND",
        conditions: [
          {
            field: "customField",
            operator: "equals",
            customFieldKey: "investor",
            value: "yes",
          },
        ],
      }),
    ).toBe(true);
  });

  it("matches legacy custom-field equals syntax", () => {
    expect(
      evaluateEnrollmentConditions({
        lead: buildLead(),
        logic: "AND",
        conditions: [
          {
            field: "customField",
            operator: "equals",
            value: "investor:yes",
          },
        ],
      }),
    ).toBe(true);
  });

  it("supports custom-field not_equals", () => {
    expect(
      evaluateEnrollmentConditions({
        lead: buildLead(),
        logic: "AND",
        conditions: [
          {
            field: "customField",
            operator: "not_equals",
            customFieldKey: "investor",
            value: "no",
          },
        ],
      }),
    ).toBe(true);
  });

  it("supports custom-field contains", () => {
    expect(
      evaluateEnrollmentConditions({
        lead: buildLead({ attributes: { investor: "high-net-worth" } }),
        logic: "AND",
        conditions: [
          {
            field: "customField",
            operator: "contains",
            customFieldKey: "investor",
            value: "net",
          },
        ],
      }),
    ).toBe(true);
  });

  it("supports custom-field is_empty and is_not_empty", () => {
    expect(
      evaluateEnrollmentConditions({
        lead: buildLead(),
        logic: "AND",
        conditions: [
          {
            field: "customField",
            operator: "is_empty",
            customFieldKey: "notes",
            value: null,
          },
        ],
      }),
    ).toBe(true);

    expect(
      evaluateEnrollmentConditions({
        lead: buildLead(),
        logic: "AND",
        conditions: [
          {
            field: "customField",
            operator: "is_not_empty",
            customFieldKey: "investor",
            value: null,
          },
        ],
      }),
    ).toBe(true);
  });

  it("skips campaigns outside project scope", async () => {
    vi.mocked(findLeadById).mockResolvedValue(buildLead({ projectId: "project-other" }));
    vi.mocked(findActiveAutoEnrollmentCampaigns).mockResolvedValue([
      {
        id: "campaign-1",
        workspaceId: "ws-1",
        name: "Scoped",
        status: "active",
        audienceType: "leads",
        projectIds: [TEST_PROJECT_ID],
        autoEnrollmentEnabled: true,
        enrollmentTrigger: "new_lead",
        enrollmentRules: { logic: "AND", conditions: [] },
        frequency: null,
        defaultFromName: null,
        senderName: null,
        senderEmail: null,
        sendingDomainId: null,
        createdBy: "user-1",
        ownerId: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const { evaluateCampaignAutoEnrollmentForLead } = await import(
      "@/server/services/campaign-auto-enrollment"
    );

    await evaluateCampaignAutoEnrollmentForLead({
      workspaceId: "ws-1",
      leadId: "lead-1",
      trigger: "new_lead",
      actorId: "user-1",
    });

    expect(enrollLeadInCampaignWithContext).not.toHaveBeenCalled();
  });

  it("skips HubSpot/legacy-migrated leads even when campaigns match", async () => {
    vi.mocked(findLeadById).mockResolvedValue(
      buildLead({
        attributes: {
          integration: { inboundSource: "hubspot-gv-pilot", idempotencyKey: "hubspot:contact:1" },
          campaignEnrollmentPolicy: { defaultExcluded: true, source: "hubspot_legacy_migration" },
        },
      }),
    );
    vi.mocked(findActiveAutoEnrollmentCampaigns).mockResolvedValue([
      {
        id: "campaign-1",
        workspaceId: "ws-1",
        name: "Welcome drip",
        status: "active",
        audienceType: "leads",
        projectIds: [],
        autoEnrollmentEnabled: true,
        enrollmentTrigger: "new_lead",
        enrollmentRules: { logic: "AND", conditions: [] },
        frequency: null,
        defaultFromName: null,
        senderName: null,
        senderEmail: null,
        sendingDomainId: null,
        createdBy: "user-1",
        ownerId: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const { evaluateCampaignAutoEnrollmentForLead } = await import(
      "@/server/services/campaign-auto-enrollment"
    );

    await evaluateCampaignAutoEnrollmentForLead({
      workspaceId: "ws-1",
      leadId: "lead-1",
      trigger: "new_lead",
      actorId: "user-1",
    });

    expect(enrollLeadInCampaignWithContext).not.toHaveBeenCalled();
    expect(findActiveAutoEnrollmentCampaigns).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "campaign.auto_enrollment_skipped",
        after: expect.objectContaining({ reason: "campaign_guard_migrated_lead" }),
      }),
    );
  });

  it("enrolls matching leads for active auto-enrollment campaigns", async () => {
    vi.mocked(findLeadById).mockResolvedValue(buildLead());
    vi.mocked(findActiveAutoEnrollmentCampaigns).mockResolvedValue([
      {
        id: "campaign-1",
        workspaceId: "ws-1",
        name: "Welcome drip",
        status: "active",
        audienceType: "leads",
        projectIds: [],
        autoEnrollmentEnabled: true,
        enrollmentTrigger: "new_lead",
        enrollmentRules: { logic: "AND", conditions: [] },
        frequency: null,
        defaultFromName: null,
        senderName: null,
        senderEmail: null,
        sendingDomainId: null,
        createdBy: "user-1",
        ownerId: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(enrollLeadInCampaignWithContext).mockResolvedValue({
      id: "enrollment-1",
    } as never);

    const { evaluateCampaignAutoEnrollmentForLead } = await import(
      "@/server/services/campaign-auto-enrollment"
    );

    await evaluateCampaignAutoEnrollmentForLead({
      workspaceId: "ws-1",
      leadId: "lead-1",
      trigger: "new_lead",
      actorId: "user-1",
    });

    expect(enrollLeadInCampaignWithContext).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        campaignId: "campaign-1",
        leadId: "lead-1",
        enrollmentSource: "rule_based_auto_enrollment",
      }),
    );
    expect(createAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "campaign.auto_enrollment_skipped" }),
    );
  });

  it("audits skipped auto-enrollment when enrollment cannot be created", async () => {
    vi.mocked(findLeadById).mockResolvedValue(buildLead());
    vi.mocked(findActiveAutoEnrollmentCampaigns).mockResolvedValue([
      {
        id: "campaign-1",
        workspaceId: "ws-1",
        name: "Welcome drip",
        status: "active",
        audienceType: "leads",
        projectIds: [],
        autoEnrollmentEnabled: true,
        enrollmentTrigger: "new_lead",
        enrollmentRules: { logic: "AND", conditions: [] },
        frequency: null,
        defaultFromName: null,
        senderName: null,
        senderEmail: null,
        sendingDomainId: null,
        createdBy: "user-1",
        ownerId: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(enrollLeadInCampaignWithContext).mockResolvedValue(null);

    const { evaluateCampaignAutoEnrollmentForLead } = await import(
      "@/server/services/campaign-auto-enrollment"
    );

    await evaluateCampaignAutoEnrollmentForLead({
      workspaceId: "ws-1",
      leadId: "lead-1",
      trigger: "new_lead",
      actorId: "user-1",
    });

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "campaign.auto_enrollment_skipped",
        entityId: "lead-1",
        after: expect.objectContaining({
          campaignId: "campaign-1",
          trigger: "new_lead",
        }),
      }),
    );
  });
});

describe("auto-enrollment failure visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs and audits failed auto-enrollment attempts", () => {
    const error = new Error("enrollment failed");

    logAutoEnrollmentFailure(
      {
        workspaceId: "ws-1",
        leadId: "lead-1",
        trigger: "new_lead",
        actorId: "user-1",
      },
      error,
    );

    expect(captureError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        workspaceId: "ws-1",
        tags: expect.objectContaining({
          leadId: "lead-1",
          trigger: "new_lead",
        }),
      }),
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "campaign.auto_enrollment_failed",
        entityId: "lead-1",
      }),
    );
  });

  it("captures errors from scheduleCampaignAutoEnrollmentForLead", async () => {
    vi.mocked(findLeadById).mockRejectedValue(new Error("database unavailable"));

    scheduleCampaignAutoEnrollmentForLead({
      workspaceId: "ws-1",
      leadId: "lead-1",
      trigger: "lead_updated",
      actorId: "user-1",
    });

    await vi.waitFor(() => {
      expect(captureError).toHaveBeenCalled();
    });
  });
});
