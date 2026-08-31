import { beforeEach, describe, expect, it, vi } from "vitest";

import { leadRecordExtras, projectRecordExtras, campaignRecordExtras, enrollmentRecordExtras, activityRecordExtras, opportunityRecordExtras } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/leads", () => ({
  findActiveLeadByEmailNormalized: vi.fn(),
  findLeadByPhoneNormalized: vi.fn(),
  createLead: vi.fn(),
  findLeadById: vi.fn(),
  archiveLead: vi.fn(),
  restoreLead: vi.fn(),
  updateLead: vi.fn(),
  findLeads: vi.fn(),
  findLeadIds: vi.fn(),
}));

vi.mock("@/server/repositories/lead-project-memberships", () => ({
  findLeadIdsForProjectMembership: vi.fn(),
}));

vi.mock("@/server/services/lead-project-memberships", () => ({
  ensurePrimaryMembershipForLead: vi.fn(),
  loadMembershipsByLeadIds: vi.fn(),
}));

vi.mock("@/server/repositories/memberships", () => ({
  findMembership: vi.fn(),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemById: vi.fn(),
}));

vi.mock("@/server/repositories/tags", () => ({
  findTagById: vi.fn(),
}));

vi.mock("@/server/repositories/users", () => ({
  findUserById: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("@/server/repositories/companies", () => ({
  findCompaniesByIds: vi.fn(),
}));

vi.mock("@/server/repositories/activities", () => ({
  findLeadActivitySummaries: vi.fn(),
}));

vi.mock("@/server/services/campaign-auto-enrollment", () => ({
  evaluateCampaignAutoEnrollmentForLead: vi.fn(),
  logAutoEnrollmentFailure: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findDictionaryItemById } from "@/server/repositories/dictionary-items";
import { findMembership } from "@/server/repositories/memberships";
import { findProjectById } from "@/server/repositories/projects";
import { findCompaniesByIds } from "@/server/repositories/companies";
import {
  archiveLead,
  createLead,
  findActiveLeadByEmailNormalized,
  findLeadById,
  findLeadByPhoneNormalized,
  findLeads,
  restoreLead,
  updateLead,
} from "@/server/repositories/leads";
import { findLeadActivitySummaries } from "@/server/repositories/activities";
import { findLeadIdsForProjectMembership } from "@/server/repositories/lead-project-memberships";
import { findTagById } from "@/server/repositories/tags";
import { evaluateCampaignAutoEnrollmentForLead } from "@/server/services/campaign-auto-enrollment";
import {
  ensurePrimaryMembershipForLead,
  loadMembershipsByLeadIds,
} from "@/server/services/lead-project-memberships";
import {
  archiveLeadForWorkspace,
  createLeadForWorkspace,
  listLeadsForWorkspace,
  normalizeLeadEmail,
  normalizeLeadPhone,
  restoreLeadForWorkspace,
  updateLeadForWorkspace,
} from "@/server/services/leads";

const baseLead = {
  id: "lead-1",
  workspaceId: "ws-1",
  ...leadRecordExtras,
  projectId: "project-1",
  statusId: "status-1",
  sourceId: null,
  ownerId: null,
  assignedTo: null,
  firstName: "John",
  lastName: "Smith",
  fullName: "John Smith",
  email: "john@example.com",
  emailNormalized: "john@example.com",
  phone: "+41 79 123 45 67",
  phoneNormalized: "+41791234567",
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
};

describe("lead service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findDictionaryItemById).mockResolvedValue({
      id: "status-1",
      workspaceId: "ws-1",
      dictionaryId: "dict-1",
      type: "lead_status",
      label: "New",
      key: "new",
      color: "#3B82F6",
      order: 0,
      isDefault: true,
      isActive: true,
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findActiveLeadByEmailNormalized).mockResolvedValue(null);
    vi.mocked(findLeadByPhoneNormalized).mockResolvedValue(null);
    vi.mocked(findLeadActivitySummaries).mockResolvedValue(new Map());
    vi.mocked(loadMembershipsByLeadIds).mockResolvedValue(new Map());
    vi.mocked(ensurePrimaryMembershipForLead).mockResolvedValue({
      id: "mem-1",
    } as never);
    vi.mocked(findLeadIdsForProjectMembership).mockResolvedValue([]);
    vi.mocked(findCompaniesByIds).mockResolvedValue([]);
    vi.mocked(findProjectById).mockResolvedValue({
      id: "project-1",
      workspaceId: "ws-1",
      name: "Default Project",
      reference: "default",
      ...projectRecordExtras,
      statusId: null,
      address: null,
      city: null,
      country: null,
      description: null,
      createdBy: "user-1",
      ownerId: null,
      assignedTo: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("lists unmigrated leads without projectId without throwing", async () => {
    vi.mocked(findLeads).mockResolvedValue({
      leads: [{ ...baseLead, projectId: null }],
      total: 1,
    });

    const result = await listLeadsForWorkspace("ws-1");

    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]?.projectId).toBeNull();
    expect(result.leads[0]?.project).toBeNull();
    expect(result.leads[0]?.lastActivity).toBeNull();
    expect(result.leads[0]?.nextAction).toBeNull();
    expect(findLeadActivitySummaries).toHaveBeenCalledWith("ws-1", ["lead-1"]);
  });

  it("attaches last activity and next action from the workspace activity timeline", async () => {
    const lastActivity = {
      id: "act-last",
      title: "Appel François",
      at: new Date("2026-08-28T10:00:00.000Z"),
    };
    const nextAction = {
      id: "act-next",
      title: "Relance Genève",
      at: new Date("2026-09-01T09:00:00.000Z"),
    };
    vi.mocked(findLeads).mockResolvedValue({
      leads: [baseLead],
      total: 1,
    });
    vi.mocked(findLeadActivitySummaries).mockResolvedValue(
      new Map([["lead-1", { lastActivity, nextAction }]]),
    );

    const result = await listLeadsForWorkspace("ws-1");

    expect(result.leads[0]?.lastActivity).toEqual(lastActivity);
    expect(result.leads[0]?.nextAction).toEqual(nextAction);
  });

  it("filters by associated project memberships when requested", async () => {
    vi.mocked(findLeadIdsForProjectMembership).mockResolvedValue(["lead-1"]);
    vi.mocked(findLeads).mockResolvedValue({
      leads: [baseLead],
      total: 1,
    });

    await listLeadsForWorkspace("ws-1", {
      projectId: "project-2",
      includeAssociated: true,
    });

    expect(findLeadIdsForProjectMembership).toHaveBeenCalledWith("ws-1", "project-2");
    expect(findLeads).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        projectId: "project-2",
        includeAssociated: true,
        associatedLeadIds: ["lead-1"],
      }),
    );
  });

  it("keeps primary-project leads when includeAssociated has no membership rows", async () => {
    vi.mocked(findLeadIdsForProjectMembership).mockResolvedValue([]);
    vi.mocked(findLeads).mockResolvedValue({
      leads: [baseLead],
      total: 1,
    });

    const result = await listLeadsForWorkspace("ws-1", {
      projectId: "project-1",
      includeAssociated: true,
    });

    expect(result.total).toBe(1);
    expect(findLeads).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        projectId: "project-1",
        includeAssociated: true,
        associatedLeadIds: [],
      }),
    );
  });

  it("creates a primary membership on lead create without replacing campaign enrollment", async () => {
    vi.mocked(createLead).mockResolvedValue(baseLead);

    await createLeadForWorkspace("ws-1", "user-1", {
      projectId: "project-1",
      firstName: "John",
      lastName: "Smith",
      statusId: "status-1",
    });

    expect(ensurePrimaryMembershipForLead).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        leadId: "lead-1",
        projectId: "project-1",
        source: "lead_create",
      }),
    );
    expect(evaluateCampaignAutoEnrollmentForLead).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      leadId: "lead-1",
      trigger: "new_lead",
      actorId: "user-1",
    });
  });

  it("derives fullName server-side on create", async () => {
    vi.mocked(createLead).mockResolvedValue(baseLead);

    await createLeadForWorkspace("ws-1", "user-1", {
      projectId: "project-1",
      firstName: "John",
      lastName: "Smith",
      statusId: "status-1",
    });

    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "John Smith",
        workspaceId: "ws-1",
        createdBy: "user-1",
      }),
    );
  });

  it("schedules new_lead campaign automation by default", async () => {
    vi.mocked(createLead).mockResolvedValue(baseLead);

    await createLeadForWorkspace("ws-1", "user-1", {
      projectId: "project-1",
      firstName: "John",
      lastName: "Smith",
      statusId: "status-1",
    });

    expect(evaluateCampaignAutoEnrollmentForLead).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      leadId: "lead-1",
      trigger: "new_lead",
      actorId: "user-1",
    });
  });

  it("skips new_lead campaign automation when triggerAutomation is false", async () => {
    vi.mocked(createLead).mockResolvedValue(baseLead);

    await createLeadForWorkspace(
      "ws-1",
      "user-1",
      {
        projectId: "project-1",
        firstName: "John",
        lastName: "Smith",
        statusId: "status-1",
      },
      { triggerAutomation: false },
    );

    expect(evaluateCampaignAutoEnrollmentForLead).not.toHaveBeenCalled();
  });

  it("normalizes email on create", async () => {
    vi.mocked(createLead).mockResolvedValue(baseLead);

    await createLeadForWorkspace("ws-1", "user-1", {
      projectId: "project-1",
      firstName: "John",
      lastName: "Smith",
      statusId: "status-1",
      email: "  John@Example.COM ",
    });

    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "John@Example.COM",
        emailNormalized: "john@example.com",
      }),
    );
  });

  it("normalizes phone on create", () => {
    expect(normalizeLeadPhone("+41 79 123 45 67")).toEqual({
      phone: "+41 79 123 45 67",
      phoneNormalized: "+41791234567",
    });
  });

  it("normalizes email helper lowercases value", () => {
    expect(normalizeLeadEmail(" Test@Example.com ")).toEqual({
      email: "Test@Example.com",
      emailNormalized: "test@example.com",
    });
  });

  it("prevents duplicate normalized email within the same project", async () => {
    vi.mocked(findActiveLeadByEmailNormalized).mockResolvedValue(baseLead);

    await expect(
      createLeadForWorkspace("ws-1", "user-1", {
        projectId: "project-1",
        firstName: "Jane",
        lastName: "Doe",
        statusId: "status-1",
        email: "john@example.com",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(findActiveLeadByEmailNormalized).toHaveBeenCalledWith(
      "ws-1",
      "john@example.com",
      undefined,
      "project-1",
    );
  });

  it("returns duplicate phone warning without blocking create", async () => {
    vi.mocked(findLeadByPhoneNormalized).mockResolvedValue(baseLead);
    vi.mocked(createLead).mockResolvedValue(baseLead);

    const result = await createLeadForWorkspace("ws-1", "user-1", {
      projectId: "project-1",
      firstName: "Jane",
      lastName: "Doe",
      statusId: "status-1",
      phone: "+41 79 123 45 67",
    });

    expect(result.warnings).toContain("duplicate_phone");
  });

  it("validates lead tags support lead entity type", async () => {
    vi.mocked(findTagById).mockResolvedValue({
      id: "tag-1",
      workspaceId: "ws-1",
      name: "VIP",
      color: "#000000",
      entityTypes: ["property"],
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      createLeadForWorkspace("ws-1", "user-1", {
        projectId: "project-1",
        firstName: "John",
        lastName: "Smith",
        statusId: "status-1",
        tags: ["tag-1"],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("validates assignedTo refers to an active workspace member", async () => {
    vi.mocked(findMembership).mockResolvedValue(null);

    await expect(
      createLeadForWorkspace("ws-1", "user-1", {
        projectId: "project-1",
        firstName: "John",
        lastName: "Smith",
        statusId: "status-1",
        assignedTo: "user-99",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("passes assignedTo to createLead when member is active", async () => {
    vi.mocked(findMembership).mockResolvedValue({
      id: "m2",
      userId: "user-2",
      workspaceId: "ws-1",
      roleId: "role-2",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(createLead).mockResolvedValue({
      ...baseLead,
      assignedTo: "user-2",
    });

    await createLeadForWorkspace("ws-1", "user-1", {
      projectId: "project-1",
      firstName: "John",
      lastName: "Smith",
      statusId: "status-1",
      assignedTo: "user-2",
    });

    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedTo: "user-2",
      }),
    );
  });

  it("derives fullName when name changes on update", async () => {
    vi.mocked(findLeadById).mockResolvedValue(baseLead);
    vi.mocked(updateLead).mockResolvedValue({
      ...baseLead,
      firstName: "Jane",
      lastName: "Smith",
      fullName: "Jane Smith",
    });

    await updateLeadForWorkspace("ws-1", "lead-1", "user-1", {
      firstName: "Jane",
    });

    expect(updateLead).toHaveBeenCalledWith(
      "ws-1",
      "lead-1",
      expect.objectContaining({
        firstName: "Jane",
        fullName: "Jane Smith",
      }),
    );
  });

  it("stamps intelligence provenance on create and skips restamp when values are unchanged", async () => {
    vi.mocked(createLead).mockResolvedValue({
      ...baseLead,
      industry: "Finance",
      jobTitle: "Analyst",
    });

    await createLeadForWorkspace("ws-1", "user-1", {
      projectId: "project-1",
      firstName: "John",
      lastName: "Smith",
      statusId: "status-1",
      industry: "Finance",
      jobTitle: "Analyst",
    });

    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        industry: "Finance",
        jobTitle: "Analyst",
        intelligenceProvenance: expect.objectContaining({
          industry: expect.objectContaining({ method: "manual", source: "lead_create" }),
          jobTitle: expect.objectContaining({ method: "manual", source: "lead_create" }),
        }),
      }),
    );

    vi.mocked(findLeadById).mockResolvedValue({
      ...baseLead,
      industry: "Finance",
      jobTitle: "Analyst",
      intelligenceProvenance: {
        industry: {
          method: "hubspot",
          source: "hubspot_cmp_enrichment",
          appliedAt: "2026-08-01T00:00:00.000Z",
          notes: null,
        },
      },
    });
    vi.mocked(updateLead).mockResolvedValue({
      ...baseLead,
      industry: "Finance",
    });

    await updateLeadForWorkspace("ws-1", "lead-1", "user-1", {
      industry: "Finance",
    });

    expect(updateLead).toHaveBeenCalledWith(
      "ws-1",
      "lead-1",
      expect.objectContaining({
        industry: "Finance",
        intelligenceProvenance: expect.objectContaining({
          industry: expect.objectContaining({ method: "hubspot" }),
        }),
      }),
    );
  });

  it("does not enroll campaigns when lead update sets triggerAutomation false", async () => {
    vi.mocked(findLeadById).mockResolvedValue(baseLead);
    vi.mocked(updateLead).mockResolvedValue({
      ...baseLead,
      industry: "Finance",
    });

    await updateLeadForWorkspace(
      "ws-1",
      "lead-1",
      "user-1",
      { industry: "Finance" },
      { triggerAutomation: false, intelligenceMethod: "hubspot" },
    );

    expect(evaluateCampaignAutoEnrollmentForLead).not.toHaveBeenCalled();
  });

  it("archives lead by setting archivedAt", async () => {
    vi.mocked(findLeadById).mockResolvedValue(baseLead);
    vi.mocked(archiveLead).mockResolvedValue({
      ...baseLead,
      archivedAt: new Date("2026-01-01"),
    });

    const archived = await archiveLeadForWorkspace("ws-1", "lead-1", "user-1");

    expect(archiveLead).toHaveBeenCalledWith("ws-1", "lead-1");
    expect(archived.archivedAt).toBeTruthy();
  });

  it("restores archived lead by clearing archivedAt", async () => {
    const archivedAt = new Date("2026-01-01");
    vi.mocked(findLeadById).mockResolvedValue({
      ...baseLead,
      archivedAt,
    });
    vi.mocked(restoreLead).mockResolvedValue({
      ...baseLead,
      archivedAt: null,
    });

    const restored = await restoreLeadForWorkspace("ws-1", "lead-1", "user-1");

    expect(restoreLead).toHaveBeenCalledWith("ws-1", "lead-1");
    expect(restored.archivedAt).toBeNull();
  });

  it("rejects restore when another active lead already uses the email", async () => {
    vi.mocked(findLeadById).mockResolvedValue({
      ...baseLead,
      archivedAt: new Date("2026-01-01"),
      emailNormalized: "john@example.com",
      projectId: "project-1",
    });
    vi.mocked(findActiveLeadByEmailNormalized).mockResolvedValue({
      ...baseLead,
      id: "lead-2",
      archivedAt: null,
    });

    await expect(restoreLeadForWorkspace("ws-1", "lead-1", "user-1")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(restoreLead).not.toHaveBeenCalled();
  });
});
