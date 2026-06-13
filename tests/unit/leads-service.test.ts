import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/leads", () => ({
  findActiveLeadByEmailNormalized: vi.fn(),
  findLeadByPhoneNormalized: vi.fn(),
  createLead: vi.fn(),
  findLeadById: vi.fn(),
  archiveLead: vi.fn(),
  updateLead: vi.fn(),
  findLeads: vi.fn(),
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

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { findDictionaryItemById } from "@/server/repositories/dictionary-items";
import { findMembership } from "@/server/repositories/memberships";
import {
  archiveLead,
  createLead,
  findActiveLeadByEmailNormalized,
  findLeadById,
  findLeadByPhoneNormalized,
  updateLead,
} from "@/server/repositories/leads";
import { findTagById } from "@/server/repositories/tags";
import {
  archiveLeadForWorkspace,
  createLeadForWorkspace,
  normalizeLeadEmail,
  normalizeLeadPhone,
  updateLeadForWorkspace,
} from "@/server/services/leads";

const baseLead = {
  id: "lead-1",
  workspaceId: "ws-1",
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
  });

  it("derives fullName server-side on create", async () => {
    vi.mocked(createLead).mockResolvedValue(baseLead);

    await createLeadForWorkspace("ws-1", "user-1", {
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

  it("normalizes email on create", async () => {
    vi.mocked(createLead).mockResolvedValue(baseLead);

    await createLeadForWorkspace("ws-1", "user-1", {
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

  it("prevents duplicate normalized email within workspace", async () => {
    vi.mocked(findActiveLeadByEmailNormalized).mockResolvedValue(baseLead);

    await expect(
      createLeadForWorkspace("ws-1", "user-1", {
        firstName: "Jane",
        lastName: "Doe",
        statusId: "status-1",
        email: "john@example.com",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("returns duplicate phone warning without blocking create", async () => {
    vi.mocked(findLeadByPhoneNormalized).mockResolvedValue(baseLead);
    vi.mocked(createLead).mockResolvedValue(baseLead);

    const result = await createLeadForWorkspace("ws-1", "user-1", {
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
});
