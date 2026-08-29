import { beforeEach, describe, expect, it, vi } from "vitest";

import { leadRecordExtras, TEST_PROJECT_ID } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/integrations", () => ({
  findActiveWebsiteIntegrationByApiKeyHash: vi.fn(),
  findWebsiteIntegrationByApiKeyHash: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findActiveLeadByEmailNormalized: vi.fn(),
  findLeadByIntegrationIdempotencyKey: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjects: vi.fn(),
  findProjectById: vi.fn(),
  findProjectByReference: vi.fn(),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemByTypeAndKey: vi.fn(),
}));

vi.mock("@/server/services/default-dictionaries", () => ({
  ensureDefaultDictionaries: vi.fn(),
}));

vi.mock("@/server/services/leads", () => ({
  createLeadForWorkspace: vi.fn(),
  normalizeLeadEmail: vi.fn((email: string) => ({
    email,
    emailNormalized: email.toLowerCase(),
  })),
}));

vi.mock("@/server/services/integration-logs", () => ({
  buildWebsiteLeadPayloadSummary: vi.fn(() => ({ emailPresent: true })),
  writeIntegrationLog: vi.fn(),
}));

vi.mock("@/server/services/integration-api-keys", () => ({
  hashIntegrationApiKey: vi.fn(() => "hashed-key"),
  parseIntegrationApiKeyFromRequest: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import { findProjects, findProjectById, findProjectByReference } from "@/server/repositories/projects";
import {
  findActiveWebsiteIntegrationByApiKeyHash,
  findWebsiteIntegrationByApiKeyHash,
} from "@/server/repositories/integrations";
import {
  findActiveLeadByEmailNormalized,
  findLeadByIntegrationIdempotencyKey,
} from "@/server/repositories/leads";
import { writeIntegrationLog } from "@/server/services/integration-logs";
import { createLeadForWorkspace } from "@/server/services/leads";
import {
  captureWebsiteLead,
  resolveWebsiteIntegrationFromApiKey,
  resolveWebsiteLeadProjectId,
} from "@/server/services/website-lead-capture";
import { AppError } from "@/server/errors";

const integration = {
  id: "int-1",
  workspaceId: "ws-1",
  type: "website" as const,
  name: "Website",
  status: "active" as const,
  credentialsEncrypted: null,
  externalAccountId: null,
  apiKeyHash: "hashed-key",
  defaultProjectId: null,
  allowProjectOverride: false,
  createdBy: "user-1",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const activeProject = {
  id: TEST_PROJECT_ID,
  workspaceId: "ws-1",
  name: "Default Project",
  reference: "default",
  projectType: null,
  defaultDripCampaignId: null,
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
};

describe("website lead capture service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue(integration);
    vi.mocked(findDictionaryItemByTypeAndKey).mockImplementation(async (_ws, type, key) => ({
      id: type === "lead_status" ? "status-1" : "source-1",
      workspaceId: "ws-1",
      dictionaryId: "dict-1",
      type,
      label: key,
      key,
      color: "#000",
      order: 0,
      isDefault: true,
      isActive: true,
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    vi.mocked(findLeadByIntegrationIdempotencyKey).mockResolvedValue(null);
    vi.mocked(findActiveLeadByEmailNormalized).mockResolvedValue(null);
    vi.mocked(findProjects).mockResolvedValue([activeProject]);
    vi.mocked(findProjectById).mockImplementation(async (_ws, projectId) => {
      if (projectId === TEST_PROJECT_ID) {
        return activeProject;
      }
      if (projectId === "archived-project") {
        return { ...activeProject, id: "archived-project", archivedAt: new Date() };
      }
      return null;
    });
    vi.mocked(findProjectByReference).mockImplementation(async (_ws, reference) => {
      if (reference === "default") {
        return activeProject;
      }
      return null;
    });
    vi.mocked(createLeadForWorkspace).mockResolvedValue({
      lead: {
        id: "lead-1",
        workspaceId: "ws-1",
  ...leadRecordExtras,
        statusId: "status-1",
        sourceId: "source-1",
        ownerId: null,
        assignedTo: null,
        firstName: "John",
        lastName: "Smith",
        fullName: "John Smith",
        email: "john@example.com",
        emailNormalized: "john@example.com",
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
        project: null,
        status: null,
        source: null,
        tagsResolved: [],
        assignedUser: null,
        ownerUser: null,
      },
      warnings: [],
    });
  });

  it("resolves workspace from API key hash", async () => {
    const resolved = await resolveWebsiteIntegrationFromApiKey("raw-key");

    expect(resolved.workspaceId).toBe("ws-1");
  });

  it("rejects invalid API keys", async () => {
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue(null);
    vi.mocked(findWebsiteIntegrationByApiKeyHash).mockResolvedValue(null);

    await expect(resolveWebsiteIntegrationFromApiKey("bad-key")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("rejects paused or archived integrations", async () => {
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue(null);
    vi.mocked(findWebsiteIntegrationByApiKeyHash).mockResolvedValue({
      ...integration,
      status: "paused",
    });

    await expect(resolveWebsiteIntegrationFromApiKey("raw-key")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("creates leads in the integration workspace with website source", async () => {
    const result = await captureWebsiteLead("raw-key", {
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      utm: { source: "google", medium: "cpc", campaign: "spring-buyers" },
      idempotencyKey: "form-1",
    });

    expect(createLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      expect.objectContaining({
        sourceId: "source-1",
        projectId: TEST_PROJECT_ID,
        attributes: {
          integration: expect.objectContaining({
            integrationId: "int-1",
            idempotencyKey: "form-1",
            utm: { source: "google", medium: "cpc", campaign: "spring-buyers" },
          }),
        },
      }),
    );
    expect(result.leadId).toBe("lead-1");
    expect(writeIntegrationLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "website.lead.created", status: "success" }),
    );
  });

  it("returns idempotent existing lead for repeated idempotency keys", async () => {
    vi.mocked(findLeadByIntegrationIdempotencyKey).mockResolvedValue({
      id: "lead-existing",
      workspaceId: "ws-1",
  ...leadRecordExtras,
      statusId: "status-1",
      sourceId: "source-1",
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

    const result = await captureWebsiteLead("raw-key", {
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      idempotencyKey: "form-1",
    });

    expect(result).toEqual({
      leadId: "lead-existing",
      duplicate: true,
      idempotent: true,
    });
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("returns idempotent lead when create conflicts on duplicate idempotency key", async () => {
    vi.mocked(createLeadForWorkspace).mockRejectedValue(
      new AppError("CONFLICT", "A lead with this email already exists in this workspace."),
    );
    vi.mocked(findLeadByIntegrationIdempotencyKey)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "lead-race",
        workspaceId: "ws-1",
        ...leadRecordExtras,
        statusId: "status-1",
        sourceId: "source-1",
        ownerId: null,
        assignedTo: null,
        firstName: "Race",
        lastName: "Winner",
        fullName: "Race Winner",
        email: null,
        emailNormalized: null,
        phone: "+15551234567",
        phoneNormalized: "+15551234567",
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
        attributes: {
          integration: {
            integrationId: "int-1",
            idempotencyKey: "phone-form-1",
          },
        },
        emailConsentStatus: "unknown",
        emailUnsubscribedAt: null,
        emailUnsubscribeReason: null,
        lastContactedAt: null,
        createdBy: "user-1",
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const result = await captureWebsiteLead("raw-key", {
      firstName: "John",
      lastName: "Smith",
      phone: "+15551234567",
      idempotencyKey: "phone-form-1",
    });

    expect(result).toEqual({
      leadId: "lead-race",
      duplicate: true,
      idempotent: true,
    });
  });

  it("returns duplicate lead for existing normalized email without creating a new lead", async () => {
    vi.mocked(findActiveLeadByEmailNormalized).mockResolvedValue({
      id: "lead-dup",
      workspaceId: "ws-1",
  ...leadRecordExtras,
      statusId: "status-1",
      sourceId: "source-1",
      ownerId: null,
      assignedTo: null,
      firstName: "Jane",
      lastName: "Doe",
      fullName: "Jane Doe",
      email: "john@example.com",
      emailNormalized: "john@example.com",
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

    const result = await captureWebsiteLead("raw-key", {
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
    });

    expect(result.duplicate).toBe(true);
    expect(result.leadId).toBe("lead-dup");
    expect(createLeadForWorkspace).not.toHaveBeenCalled();
  });

  it("handles createLead CONFLICT race by returning duplicate lead reference", async () => {
    vi.mocked(findActiveLeadByEmailNormalized)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "lead-race",
        workspaceId: "ws-1",
  ...leadRecordExtras,
        statusId: "status-1",
        sourceId: "source-1",
        ownerId: null,
        assignedTo: null,
        firstName: "Jane",
        lastName: "Doe",
        fullName: "Jane Doe",
        email: "john@example.com",
        emailNormalized: "john@example.com",
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
    vi.mocked(createLeadForWorkspace).mockRejectedValue(
      new AppError("CONFLICT", "A lead with this email already exists in this workspace."),
    );

    const result = await captureWebsiteLead("raw-key", {
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
    });

    expect(result).toEqual({
      leadId: "lead-race",
      duplicate: true,
      idempotent: false,
    });
  });

  it("rejects capture when no active projects exist", async () => {
    vi.mocked(findProjects).mockResolvedValue([]);

    await expect(
      captureWebsiteLead("raw-key", {
        firstName: "John",
        lastName: "Smith",
        email: "john@example.com",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("auto-selects the only active project in a single-project workspace", async () => {
    await captureWebsiteLead("raw-key", {
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
    });

    expect(createLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      expect.objectContaining({ projectId: TEST_PROJECT_ID }),
    );
  });

  it("rejects capture when multiple active projects exist without mapping", async () => {
    vi.mocked(findProjects).mockResolvedValue([
      activeProject,
      { ...activeProject, id: "project-2", name: "Second Project", reference: "second" },
    ]);

    await expect(
      captureWebsiteLead("raw-key", {
        firstName: "John",
        lastName: "Smith",
        email: "john@example.com",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("default project"),
    });
  });

  it("accepts explicit projectId from payload when override is enabled", async () => {
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue({
      ...integration,
      allowProjectOverride: true,
    });
    vi.mocked(findProjects).mockResolvedValue([
      activeProject,
      { ...activeProject, id: "project-2", name: "Second Project", reference: "second" },
    ]);

    await captureWebsiteLead("raw-key", {
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      projectId: TEST_PROJECT_ID,
    });

    expect(createLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      expect.objectContaining({ projectId: TEST_PROJECT_ID }),
    );
  });

  it("allows locked payload projectId when it matches the default project", async () => {
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue({
      ...integration,
      defaultProjectId: TEST_PROJECT_ID,
      allowProjectOverride: false,
    });
    vi.mocked(findProjects).mockResolvedValue([
      activeProject,
      { ...activeProject, id: "project-2", name: "Second Project", reference: "second" },
    ]);

    await captureWebsiteLead("raw-key", {
      firstName: "John",
      lastName: "Smith",
      email: "john-match@example.com",
      projectId: TEST_PROJECT_ID,
    });

    expect(createLeadForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      expect.objectContaining({ projectId: TEST_PROJECT_ID }),
    );
  });

  it("rejects payload projectId when project override is locked", async () => {
    vi.mocked(findActiveWebsiteIntegrationByApiKeyHash).mockResolvedValue({
      ...integration,
      defaultProjectId: TEST_PROJECT_ID,
      allowProjectOverride: false,
    });
    vi.mocked(findProjects).mockResolvedValue([
      activeProject,
      { ...activeProject, id: "project-2", name: "Second Project", reference: "second" },
    ]);

    await expect(
      captureWebsiteLead("raw-key", {
        firstName: "John",
        lastName: "Smith",
        email: "john@example.com",
        projectId: "project-2",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("accepts projectReference from payload when override is enabled", async () => {
    await resolveWebsiteLeadProjectId({
      workspaceId: "ws-1",
      integration: { ...integration, allowProjectOverride: true },
      payload: { projectReference: "default" },
    });

    expect(findProjectByReference).toHaveBeenCalledWith("ws-1", "default");
  });

  it("uses integration defaultProjectId when configured", async () => {
    vi.mocked(findProjects).mockResolvedValue([
      activeProject,
      { ...activeProject, id: "project-2", name: "Second Project", reference: "second" },
    ]);

    await resolveWebsiteLeadProjectId({
      workspaceId: "ws-1",
      integration: { ...integration, defaultProjectId: TEST_PROJECT_ID },
      payload: {},
    });

    expect(findProjectById).toHaveBeenCalledWith("ws-1", TEST_PROJECT_ID);
  });

  it("rejects archived or unknown mapped projects", async () => {
    await expect(
      resolveWebsiteLeadProjectId({
        workspaceId: "ws-1",
        integration: { ...integration, allowProjectOverride: true },
        payload: { projectId: "archived-project" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(
      resolveWebsiteLeadProjectId({
        workspaceId: "ws-1",
        integration: { ...integration, allowProjectOverride: true },
        payload: { projectId: "missing-project" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
