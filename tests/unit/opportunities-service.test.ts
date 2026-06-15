import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/opportunities", () => ({
  findOpportunityById: vi.fn(),
  createOpportunity: vi.fn(),
  updateOpportunity: vi.fn(),
  archiveOpportunity: vi.fn(),
  findOpportunities: vi.fn(),
  findAllOpportunities: vi.fn(),
}));

vi.mock("@/server/repositories/leads", () => ({
  findLeadById: vi.fn(),
  findLeads: vi.fn(),
}));

vi.mock("@/server/repositories/properties", () => ({
  findPropertyById: vi.fn(),
  findProperties: vi.fn(),
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

vi.mock("@/server/repositories/workspaces", () => ({
  findWorkspaceById: vi.fn(),
}));

vi.mock("@/server/services/dictionary-items", () => ({
  listDictionaryItemsForWorkspace: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findDictionaryItemById } from "@/server/repositories/dictionary-items";
import { findLeadById } from "@/server/repositories/leads";
import { findPropertyById } from "@/server/repositories/properties";
import { findWorkspaceById } from "@/server/repositories/workspaces";
import {
  archiveOpportunity,
  createOpportunity,
  findOpportunityById,
  updateOpportunity,
} from "@/server/repositories/opportunities";
import {
  applyOpportunityStatusBehavior,
  archiveOpportunityForWorkspace,
  createOpportunityForWorkspace,
  moveOpportunityStageForWorkspace,
} from "@/server/services/opportunities";

const baseOpportunity = {
  id: "opp-1",
  workspaceId: "ws-1",
  leadId: "lead-1",
  propertyId: "prop-1",
  statusId: "status-open",
  ownerId: null,
  assignedTo: null,
  value: 875000,
  currency: "CHF",
  probability: 10,
  expectedCloseDate: null,
  lostReasonId: null,
  lostReasonText: null,
  closedAt: null,
  wonAt: null,
  lostAt: null,
  notes: null,
  tags: [],
  createdBy: "user-1",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("opportunity service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
      archivedAt: null,
      fullName: "John Smith",
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      emailNormalized: "john@example.com",
      phone: null,
      phoneNormalized: null,
      statusId: "lead-status",
      sourceId: null,
      ownerId: null,
      assignedTo: null,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(findPropertyById).mockResolvedValue({
      id: "prop-1",
      workspaceId: "ws-1",
      archivedAt: null,
      currency: "CHF",
      title: "Lake View Apartment",
      reference: "LV-12",
      projectId: null,
      statusId: "prop-status",
      typeId: null,
      ownerId: null,
      assignedTo: null,
      price: 900000,
      address: null,
      city: null,
      country: null,
      rooms: null,
      bedrooms: null,
      bathrooms: null,
      surface: null,
      floor: null,
      description: null,
      features: [],
      tags: [],
      attributes: {},
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(findDictionaryItemById).mockImplementation(async (_ws, id) => {
      if (id === "status-open") {
        return {
          id: "status-open",
          workspaceId: "ws-1",
          dictionaryId: "dict-1",
          type: "opportunity_status",
          label: "New",
          key: "new",
          color: "#3B82F6",
          order: 1,
          isDefault: true,
          isActive: true,
          isSystem: true,
          behavior: "open",
          defaultProbability: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      if (id === "status-won") {
        return {
          id: "status-won",
          workspaceId: "ws-1",
          dictionaryId: "dict-1",
          type: "opportunity_status",
          label: "Won",
          key: "won",
          color: "#10B981",
          order: 6,
          isDefault: false,
          isActive: true,
          isSystem: true,
          behavior: "terminal_won",
          defaultProbability: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      if (id === "status-lost") {
        return {
          id: "status-lost",
          workspaceId: "ws-1",
          dictionaryId: "dict-1",
          type: "opportunity_status",
          label: "Lost",
          key: "lost",
          color: "#EF4444",
          order: 7,
          isDefault: false,
          isActive: true,
          isSystem: true,
          behavior: "terminal_lost",
          defaultProbability: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      if (id === "lost-reason-1") {
        return {
          id: "lost-reason-1",
          workspaceId: "ws-1",
          dictionaryId: "dict-2",
          type: "lost_reason",
          label: "Price too high",
          key: "price_too_high",
          color: "#6B7280",
          order: 1,
          isDefault: false,
          isActive: true,
          isSystem: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return null;
    });

    vi.mocked(findWorkspaceById).mockResolvedValue({
      id: "ws-1",
      name: "Demo",
      slug: "demo",
      type: "agency",
      timezone: "UTC",
      defaultCurrency: "USD",
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("sets workspaceId and createdBy server-side on create", async () => {
    vi.mocked(createOpportunity).mockResolvedValue(baseOpportunity);

    await createOpportunityForWorkspace("ws-1", "user-1", {
      leadId: "lead-1",
      propertyId: "prop-1",
      statusId: "status-open",
    });

    expect(createOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        createdBy: "user-1",
      }),
    );
  });

  it("defaults probability from status defaultProbability on create", async () => {
    vi.mocked(createOpportunity).mockResolvedValue(baseOpportunity);

    await createOpportunityForWorkspace("ws-1", "user-1", {
      leadId: "lead-1",
      propertyId: "prop-1",
      statusId: "status-open",
    });

    expect(createOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({
        probability: 10,
      }),
    );
  });

  it("defaults currency from property when request currency is omitted", async () => {
    vi.mocked(createOpportunity).mockResolvedValue(baseOpportunity);

    await createOpportunityForWorkspace("ws-1", "user-1", {
      leadId: "lead-1",
      propertyId: "prop-1",
      statusId: "status-open",
    });

    expect(createOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "CHF",
      }),
    );
  });

  it("rejects archived lead on create", async () => {
    vi.mocked(findLeadById).mockResolvedValue({
      id: "lead-1",
      workspaceId: "ws-1",
      archivedAt: new Date(),
      fullName: "John Smith",
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      emailNormalized: "john@example.com",
      phone: null,
      phoneNormalized: null,
      statusId: "lead-status",
      sourceId: null,
      ownerId: null,
      assignedTo: null,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      createOpportunityForWorkspace("ws-1", "user-1", {
        leadId: "lead-1",
        propertyId: "prop-1",
        statusId: "status-open",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("requires lost reason when creating with terminal_lost status", async () => {
    await expect(
      createOpportunityForWorkspace("ws-1", "user-1", {
        leadId: "lead-1",
        propertyId: "prop-1",
        statusId: "status-lost",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("applies terminal_won behavior using status.behavior not label", () => {
    const effects = applyOpportunityStatusBehavior({
      behavior: "terminal_won",
      defaultProbability: 100,
    });

    expect(effects.probability).toBe(100);
    expect(effects.wonAt).toBeInstanceOf(Date);
    expect(effects.closedAt).toBeInstanceOf(Date);
    expect(effects.lostAt).toBeNull();
    expect(effects.lostReasonId).toBeNull();
  });

  it("applies terminal_lost behavior and requires lost reason in stage move", async () => {
    vi.mocked(findOpportunityById).mockResolvedValue(baseOpportunity);

    await expect(
      moveOpportunityStageForWorkspace("ws-1", "opp-1", "user-1", {
        statusId: "status-lost",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("sets wonAt and probability 100 when moving to terminal_won", async () => {
    vi.mocked(findOpportunityById).mockResolvedValue(baseOpportunity);
    vi.mocked(updateOpportunity).mockResolvedValue({
      ...baseOpportunity,
      statusId: "status-won",
      probability: 100,
      wonAt: new Date(),
      closedAt: new Date(),
    });

    await moveOpportunityStageForWorkspace("ws-1", "opp-1", "user-1", {
      statusId: "status-won",
    });

    expect(updateOpportunity).toHaveBeenCalledWith(
      "ws-1",
      "opp-1",
      expect.objectContaining({
        statusId: "status-won",
        probability: 100,
        wonAt: expect.any(Date),
        closedAt: expect.any(Date),
        lostAt: null,
      }),
    );
  });

  it("clears terminal fields when moving back to open", () => {
    const effects = applyOpportunityStatusBehavior({
      behavior: "open",
      defaultProbability: 25,
    });

    expect(effects.closedAt).toBeNull();
    expect(effects.wonAt).toBeNull();
    expect(effects.lostAt).toBeNull();
    expect(effects.lostReasonId).toBeNull();
    expect(effects.probability).toBe(25);
  });

  it("archives opportunity with archivedAt", async () => {
    vi.mocked(findOpportunityById).mockResolvedValue(baseOpportunity);
    vi.mocked(archiveOpportunity).mockResolvedValue({
      ...baseOpportunity,
      archivedAt: new Date(),
    });

    await archiveOpportunityForWorkspace("ws-1", "opp-1", "user-1");

    expect(archiveOpportunity).toHaveBeenCalledWith("ws-1", "opp-1");
  });
});
