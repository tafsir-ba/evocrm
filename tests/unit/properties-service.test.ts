import { beforeEach, describe, expect, it, vi } from "vitest";

import { projectRecordExtras } from "@/tests/helpers/crm-fixtures";

vi.mock("@/server/repositories/properties", () => ({
  findPropertyByReference: vi.fn(),
  createProperty: vi.fn(),
  findPropertyById: vi.fn(),
  archiveProperty: vi.fn(),
  updateProperty: vi.fn(),
  findProperties: vi.fn(),
}));

vi.mock("@/server/repositories/memberships", () => ({
  findMembership: vi.fn(),
}));

vi.mock("@/server/repositories/dictionary-items", () => ({
  findDictionaryItemById: vi.fn(),
}));

vi.mock("@/server/repositories/projects", () => ({
  findProjectById: vi.fn(),
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
import { findProjectById } from "@/server/repositories/projects";
import {
  archiveProperty,
  createProperty,
  findPropertyById,
  findPropertyByReference,
  updateProperty,
} from "@/server/repositories/properties";
import { findTagById } from "@/server/repositories/tags";
import {
  archivePropertyForWorkspace,
  createPropertyForWorkspace,
  normalizePropertyFeatures,
  normalizePropertyReference,
  updatePropertyForWorkspace,
} from "@/server/services/properties";

const baseProperty = {
  id: "property-1",
  workspaceId: "ws-1",
  projectId: "project-1",
  statusId: "status-1",
  typeId: null,
  ownerId: null,
  assignedTo: null,
  title: "Green View Apartment 12",
  reference: "GV-APT-12",
  price: 875000,
  currency: "CHF",
  address: "Lake Road 12",
  city: "Geneva",
  country: "Switzerland",
  rooms: 3,
  bedrooms: 2,
  bathrooms: 2,
  surface: 96,
  totalSurface: null,
  balconyTerraceSurface: null,
  surfaceUnit: "sqm" as const,
  floor: 2,
  building: null,
  lot: null,
  description: "Beautiful apartment with lake view.",
  features: ["Lake view", "Balcony"],
  tags: [],
  attributes: {},
  createdBy: "user-1",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("property service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findDictionaryItemById).mockResolvedValue({
      id: "status-1",
      workspaceId: "ws-1",
      dictionaryId: "dict-1",
      type: "property_status",
      label: "Available",
      key: "available",
      color: "#3B82F6",
      order: 0,
      isDefault: true,
      isActive: true,
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findPropertyByReference).mockResolvedValue(null);
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

  it("sets workspaceId and createdBy server-side on create", async () => {
    vi.mocked(createProperty).mockResolvedValue(baseProperty);

    await createPropertyForWorkspace("ws-1", "user-1", {
      projectId: "project-1",
      title: "Green View Apartment 12",
      statusId: "status-1",
    }, "CHF");

    expect(createProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        createdBy: "user-1",
        projectId: "project-1",
      title: "Green View Apartment 12",
      }),
    );
  });

  it("defaults currency from workspace when missing", async () => {
    vi.mocked(createProperty).mockResolvedValue(baseProperty);

    await createPropertyForWorkspace("ws-1", "user-1", {
      projectId: "project-1",
      title: "Green View Apartment 12",
      statusId: "status-1",
    }, "CHF");

    expect(createProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "CHF",
      }),
    );
  });

  it("normalizes reference on create", async () => {
    vi.mocked(createProperty).mockResolvedValue(baseProperty);

    await createPropertyForWorkspace("ws-1", "user-1", {
      projectId: "project-1",
      title: "Green View Apartment 12",
      statusId: "status-1",
      reference: "  GV-APT-12  ",
    }, "CHF");

    expect(createProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "GV-APT-12",
      }),
    );
  });

  it("persists website transfer fields on create", async () => {
    vi.mocked(createProperty).mockResolvedValue(baseProperty);

    await createPropertyForWorkspace(
      "ws-1",
      "user-1",
      {
        projectId: "project-1",
        title: "Green View Apartment 12",
        statusId: "status-1",
        totalSurface: 120,
        balconyTerraceSurface: 18,
        building: "Tower A",
        lot: "Lot 14",
      },
      "CHF",
    );

    expect(createProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        totalSurface: 120,
        balconyTerraceSurface: 18,
        building: "Tower A",
        lot: "Lot 14",
      }),
    );
  });

  it("prevents duplicate reference within workspace", async () => {
    vi.mocked(findPropertyByReference).mockResolvedValue(baseProperty);

    await expect(
      createPropertyForWorkspace("ws-1", "user-1", {
        projectId: "project-1",
        title: "Another Property",
        statusId: "status-1",
        reference: "GV-APT-12",
      }, "CHF"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows same reference in a different workspace", async () => {
    vi.mocked(findPropertyByReference).mockResolvedValue(null);
    vi.mocked(createProperty).mockResolvedValue({
      ...baseProperty,
      workspaceId: "ws-2",
      id: "property-2",
    });

    await createPropertyForWorkspace("ws-2", "user-1", {
      projectId: "project-1",
      title: "Green View Apartment 12",
      statusId: "status-1",
      reference: "GV-APT-12",
    }, "CHF");

    expect(findPropertyByReference).toHaveBeenCalledWith("ws-2", "GV-APT-12");
    expect(createProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-2",
        reference: "GV-APT-12",
      }),
    );
  });

  it("validates projectId is same workspace and non-archived", async () => {
    vi.mocked(findProjectById).mockResolvedValue({
      id: "project-1",
      workspaceId: "ws-1",
      name: "Green View",
      reference: "GV",
      ...projectRecordExtras,
      statusId: null,
      address: null,
      city: "Geneva",
      country: "Switzerland",
      description: null,
      createdBy: "user-1",
      ownerId: null,
      assignedTo: null,
      archivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      createPropertyForWorkspace("ws-1", "user-1", {
        projectId: "project-1",
        title: "Green View Apartment 12",
        statusId: "status-1",
      }, "CHF"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("requires valid property_status statusId", async () => {
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

    await expect(
      createPropertyForWorkspace("ws-1", "user-1", {
        projectId: "project-1",
      title: "Green View Apartment 12",
        statusId: "status-1",
      }, "CHF"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("validates property_type typeId", async () => {
    vi.mocked(findDictionaryItemById).mockImplementation(async (_ws, id) => {
      if (id === "type-1") {
        return {
          id: "type-1",
          workspaceId: "ws-1",
          dictionaryId: "dict-2",
          type: "lead_source",
          label: "Website",
          key: "website",
          color: "#000000",
          order: 0,
          isDefault: false,
          isActive: true,
          isSystem: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return {
        id: "status-1",
        workspaceId: "ws-1",
        dictionaryId: "dict-1",
        type: "property_status",
        label: "Available",
        key: "available",
        color: "#3B82F6",
        order: 0,
        isDefault: true,
        isActive: true,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    await expect(
      createPropertyForWorkspace("ws-1", "user-1", {
        projectId: "project-1",
      title: "Green View Apartment 12",
        statusId: "status-1",
        typeId: "type-1",
      }, "CHF"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("validates tags are same workspace and entityTypes include property", async () => {
    vi.mocked(findTagById).mockResolvedValue({
      id: "tag-1",
      workspaceId: "ws-1",
      name: "VIP",
      color: "#000000",
      entityTypes: ["lead"],
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      createPropertyForWorkspace("ws-1", "user-1", {
        projectId: "project-1",
      title: "Green View Apartment 12",
        statusId: "status-1",
        tags: ["tag-1"],
      }, "CHF"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("normalizes features by trimming, deduplicating, and removing empty values", () => {
    expect(
      normalizePropertyFeatures([" Lake view ", "Balcony", "lake view", "", "  "]),
    ).toEqual(["Lake view", "Balcony"]);
  });

  it("normalizes reference helper", () => {
    expect(normalizePropertyReference("  REF-1  ")).toBe("REF-1");
    expect(normalizePropertyReference("   ")).toBeNull();
    expect(normalizePropertyReference(null)).toBeNull();
  });

  it("validates assignedTo refers to an active workspace member", async () => {
    vi.mocked(findMembership).mockResolvedValue(null);

    await expect(
      createPropertyForWorkspace("ws-1", "user-1", {
        projectId: "project-1",
      title: "Green View Apartment 12",
        statusId: "status-1",
        assignedTo: "user-99",
      }, "CHF"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("prevents duplicate reference on update", async () => {
    vi.mocked(findPropertyById).mockResolvedValue(baseProperty);
    vi.mocked(findPropertyByReference).mockResolvedValue({
      ...baseProperty,
      id: "property-2",
    });

    await expect(
      updatePropertyForWorkspace("ws-1", "property-1", "user-1", {
        reference: "GV-APT-99",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("archives property by setting archivedAt", async () => {
    vi.mocked(findPropertyById).mockResolvedValue(baseProperty);
    vi.mocked(archiveProperty).mockResolvedValue({
      ...baseProperty,
      archivedAt: new Date("2026-01-01"),
    });

    const archived = await archivePropertyForWorkspace("ws-1", "property-1", "user-1");

    expect(archiveProperty).toHaveBeenCalledWith("ws-1", "property-1");
    expect(archived.archivedAt).toBeTruthy();
  });

  it("updates property title", async () => {
    vi.mocked(findPropertyById).mockResolvedValue(baseProperty);
    vi.mocked(updateProperty).mockResolvedValue({
      ...baseProperty,
      title: "Updated Title",
    });

    await updatePropertyForWorkspace("ws-1", "property-1", "user-1", {
      title: "Updated Title",
    });

    expect(updateProperty).toHaveBeenCalledWith(
      "ws-1",
      "property-1",
      expect.objectContaining({
        title: "Updated Title",
      }),
    );
  });
});
