import { describe, expect, it } from "vitest";

import {
  normalizeHeaderName,
  suggestFieldForHeader,
  suggestMappingsForHeaders,
} from "@/server/imports/import-header-matcher";
import { leadImportConfig } from "@/server/imports/entities/lead-import-config";
import { propertyImportConfig } from "@/server/imports/entities/property-import-config";
import type { LeadImportInput } from "@/server/imports/import-entity-config";
import {
  splitFullName,
  parseOptionalNumber,
  parseOptionalCurrency,
  parseOptionalDate,
  escapeCsvCell,
  compactLookupKey,
  registerImportLookupAliases,
  resolveProjectId,
  finalizeImportLookupField,
} from "@/server/imports/import-normalizers";
import { AppError } from "@/server/errors";
import {
  validateMappingConfiguration,
  applyRowOverrides,
  mapRowFromSource,
} from "@/server/imports/import-validator";
import { detectDuplicateHeaders, normalizeImportCellValue } from "@/server/imports/import-file-parser";

describe("import header matcher", () => {
  it("normalizes header names", () => {
    expect(normalizeHeaderName("  First-Name ")).toBe("first name");
    expect(normalizeHeaderName("Email_Address")).toBe("email address");
  });

  it("suggests lead email mapping", () => {
    const suggestion = suggestFieldForHeader("Email Address", leadImportConfig.fields);
    expect(suggestion).toBe("email");
  });

  it("suggests lead created date mapping", () => {
    const suggestion = suggestFieldForHeader("Create Date", leadImportConfig.fields);
    expect(suggestion).toBe("createdAt");
  });

  it("suggests property title mapping", () => {
    const suggestion = suggestFieldForHeader("Property Name", propertyImportConfig.fields);
    expect(suggestion).toBe("title");
  });

  it("returns null for unknown headers", () => {
    expect(suggestFieldForHeader("foobar", leadImportConfig.fields)).toBeNull();
  });

  it("does not map the same CRM field twice", () => {
    const suggestions = suggestMappingsForHeaders(
      ["email", "e-mail"],
      leadImportConfig.fields,
    );

    expect(suggestions[0]).toBe("email");
    expect(suggestions[1]).toBeNull();
  });
});

describe("import normalizers", () => {
  it("splits full names", () => {
    expect(splitFullName("John Smith")).toEqual({
      firstName: "John",
      lastName: "Smith",
    });
  });

  it("uses single token for both names when needed", () => {
    expect(splitFullName("Madonna")).toEqual({
      firstName: "Madonna",
      lastName: "Madonna",
    });
  });

  it("parses numbers and currency", () => {
    expect(parseOptionalNumber("3")).toBe(3);
    expect(parseOptionalCurrency("€1,250,000")).toBe(1250000);
  });

  it("parses import date timestamps", () => {
    const timestamp = parseOptionalDate("2026-06-16 01:59");
    expect(timestamp?.getFullYear()).toBe(2026);
    expect(timestamp?.getMonth()).toBe(5);
    expect(timestamp?.getDate()).toBe(16);
    expect(timestamp?.getHours()).toBe(1);
    expect(timestamp?.getMinutes()).toBe(59);

    const dateOnly = parseOptionalDate("2026-06-16");
    expect(dateOnly?.getFullYear()).toBe(2026);
    expect(dateOnly?.getMonth()).toBe(5);
    expect(dateOnly?.getDate()).toBe(16);

    expect(parseOptionalDate("not a date")).toBeUndefined();
  });

  it("escapes dangerous CSV values on export only", () => {
    expect(escapeCsvCell("=SUM(1,1)")).toBe("\"'=SUM(1,1)\"");
  });

  it("preserves leading plus signs in import cell values", () => {
    expect(normalizeImportCellValue("+971501234567")).toBe("+971501234567");
  });

  it("matches compact project names without spaces", () => {
    const projectLookup = new Map<string, string>();
    const projectId = "507f1f77bcf86cd799439011";
    registerImportLookupAliases(projectLookup, ["Grosvenor Vistas"], projectId);

    expect(resolveProjectId(projectLookup, "grosvenorvistas")).toBe(projectId);
    expect(compactLookupKey("Grosvenor Vistas")).toBe("grosvenorvistas");
  });

  it("throws a clear error for unknown lookup values", () => {
    const projectLookup = new Map<string, string>();

    expect(() =>
      finalizeImportLookupField(
        "grosvenorvistas",
        resolveProjectId(projectLookup, "grosvenorvistas"),
        "project",
        "projectId",
      ),
    ).toThrow(AppError);

    try {
      finalizeImportLookupField(
        "grosvenorvistas",
        resolveProjectId(projectLookup, "grosvenorvistas"),
        "project",
        "projectId",
      );
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).message).toBe('Unknown project "grosvenorvistas".');
      expect((error as AppError).details).toEqual({ field: "projectId" });
    }
  });
});

describe("import mapping validation", () => {
  it("rejects unknown CRM target fields", () => {
    const issues = validateMappingConfiguration(
      leadImportConfig,
      [{ sourceColumnIndex: 0, targetField: "notARealField" }],
      {
        projectId: "507f1f77bcf86cd799439011",
        statusId: "507f1f77bcf86cd799439012",
        firstName: "mapped separately",
      },
    );

    expect(issues.some((issue) => issue.field === "notARealField")).toBe(true);
  });
  it("treats fullName mapping as satisfying first and last name requirements", () => {
    const issues = validateMappingConfiguration(
      leadImportConfig,
      [{ sourceColumnIndex: 0, targetField: "fullName" }],
      {
        projectId: "507f1f77bcf86cd799439011",
        statusId: "507f1f77bcf86cd799439012",
      },
    );

    expect(issues).toHaveLength(0);
  });

  it("requires required lead fields to be mapped or defaulted", () => {
    const issues = validateMappingConfiguration(
      leadImportConfig,
      [
        { sourceColumnIndex: 0, targetField: "fullName" },
        { sourceColumnIndex: 1, targetField: "email" },
      ],
      {},
    );

    expect(issues.some((issue) => issue.field === "projectId")).toBe(true);
    expect(issues.some((issue) => issue.field === "statusId")).toBe(true);
  });

  it("rejects duplicate target field mappings", () => {
    const issues = validateMappingConfiguration(
      leadImportConfig,
      [
        { sourceColumnIndex: 0, targetField: "email" },
        { sourceColumnIndex: 1, targetField: "email" },
      ],
      {
        projectId: "507f1f77bcf86cd799439012",
        statusId: "507f1f77bcf86cd799439011",
      },
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Field "email" is mapped more than once.',
        }),
      ]),
    );
  });

  it("accepts required fields via defaults", () => {
    const issues = validateMappingConfiguration(
      leadImportConfig,
      [{ sourceColumnIndex: 0, targetField: "fullName" }],
      {
        projectId: "507f1f77bcf86cd799439011",
        statusId: "507f1f77bcf86cd799439012",
      },
    );

    expect(issues).toHaveLength(0);
  });

  it("ignores unmapped columns in row mapping", () => {
    const row = mapRowFromSource(
      ["John Smith", "ignored-value"],
      ["Name", "Notes"],
      [
        { sourceColumnIndex: 0, targetField: "fullName" },
        { sourceColumnIndex: 1, targetField: null },
      ],
      { projectId: "507f1f77bcf86cd799439011" },
    );

    expect(row.fullName).toBe("John Smith");
    expect(row).not.toHaveProperty("notes");
    expect(row.projectId).toBe("507f1f77bcf86cd799439011");
  });

  it("applies per-row overrides on top of mapped values", () => {
    const row = mapRowFromSource(
      ["", "Miller"],
      ["First Name", "Last Name"],
      [
        { sourceColumnIndex: 0, targetField: "firstName" },
        { sourceColumnIndex: 1, targetField: "lastName" },
      ],
      {
        projectId: "507f1f77bcf86cd799439011",
        statusId: "507f1f77bcf86cd799439012",
      },
    );

    const corrected = applyRowOverrides(row, 91, {
      "91": { firstName: "Malika" },
    });

    expect(corrected.firstName).toBe("Malika");
    expect(corrected.lastName).toBe("Miller");
  });
});

describe("import field configs", () => {
  it("defines required lead fields", () => {
    const requiredKeys = leadImportConfig.fields
      .filter((field) => field.required)
      .map((field) => field.key);

    expect(requiredKeys).toEqual(
      expect.arrayContaining(["projectId", "statusId", "firstName", "lastName"]),
    );
  });

  it("defines required property fields", () => {
    const requiredKeys = propertyImportConfig.fields
      .filter((field) => field.required)
      .map((field) => field.key);

    expect(requiredKeys).toEqual(
      expect.arrayContaining(["projectId", "statusId", "title"]),
    );
  });

  it("includes property units alias on rooms", () => {
    const roomsField = propertyImportConfig.fields.find((field) => field.key === "rooms");
    expect(roomsField?.aliases).toContain("property units");
  });

  it("resolves hubspot-style project slugs during lead import", async () => {
    const projectId = "507f1f77bcf86cd799439011";
    const statusId = "507f1f77bcf86cd799439012";
    const projectLookup = new Map<string, string>();
    registerImportLookupAliases(projectLookup, ["Grosvenor Vistas"], projectId);

    const dictionaryLookup = new Map<string, Map<string, string>>();
    const statusLookup = new Map<string, string>();
    registerImportLookupAliases(statusLookup, ["New"], statusId);
    dictionaryLookup.set("lead_status", statusLookup);

    const input = (await leadImportConfig.buildCreateInput(
      {
        projectId: "grosvenorvistas",
        statusId,
        firstName: "Malika",
        lastName: "Miller",
      },
      {
        workspaceId: "workspace-id",
        actorId: "actor-id",
        defaultCurrency: "EUR",
        dictionaryLookup,
        projectLookup,
        memberLookup: new Map(),
        tagLookup: new Map(),
      },
    )) as LeadImportInput;

    expect(input.projectId).toBe(projectId);
  });
});

describe("import file parser helpers", () => {
  it("detects duplicate headers", () => {
    expect(detectDuplicateHeaders(["Name", "Email", "name"])).toEqual(["name"]);
  });
});
