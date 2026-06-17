import { describe, expect, it } from "vitest";

import {
  sanitizeImportMappingPayload,
  sanitizeRowOverrides,
  validateImportMappingConfiguration,
} from "@/lib/import-mapping-validation";

describe("import mapping validation", () => {
  const fields = [
    {
      key: "projectId",
      label: "Project",
      required: true,
      aliases: [],
      type: "project" as const,
      supportsDefault: true,
    },
    {
      key: "statusId",
      label: "Status",
      required: true,
      aliases: [],
      type: "dictionary" as const,
      dictionaryType: "lead_status",
      supportsDefault: true,
    },
    {
      key: "firstName",
      label: "First Name",
      required: true,
      aliases: [],
      type: "string" as const,
      supportsDefault: false,
    },
    {
      key: "email",
      label: "Email",
      required: false,
      aliases: [],
      type: "email" as const,
      supportsDefault: false,
    },
  ];

  it("flags duplicate mapped fields", () => {
    const issues = validateImportMappingConfiguration(
      fields,
      [
        { sourceColumnIndex: 0, targetField: "email" },
        { sourceColumnIndex: 1, targetField: "email" },
        { sourceColumnIndex: 2, targetField: "firstName" },
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

  it("flags unknown default fields", () => {
    const issues = validateImportMappingConfiguration(
      fields,
      [{ sourceColumnIndex: 0, targetField: "firstName" }],
      {
        projectId: "507f1f77bcf86cd799439012",
        statusId: "507f1f77bcf86cd799439011",
        unknownField: "value",
      },
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Unknown default field "unknownField".',
        }),
      ]),
    );
  });

  it("sanitizes row overrides to known field keys", () => {
    const sanitized = sanitizeRowOverrides(fields, {
      "91": { firstName: "Malika", hackerField: "x" },
      "0": { firstName: "Bad row" },
      "359": { firstName: "A".repeat(120) },
    });

    expect(sanitized).toEqual({
      "91": { firstName: "Malika" },
      "359": { firstName: "A".repeat(120) },
    });
  });

  it("strips empty mapping targets and defaults in sanitizeImportMappingPayload", () => {
    const sanitized = sanitizeImportMappingPayload({
      mappings: [
        { sourceColumnIndex: 0, targetField: " email " },
        { sourceColumnIndex: 1, targetField: "" },
      ],
      defaults: {
        projectId: "507f1f77bcf86cd799439011",
        statusId: "",
      },
    });

    expect(sanitized.mappings[0]?.targetField).toBe("email");
    expect(sanitized.mappings[1]?.targetField).toBeNull();
    expect(sanitized.defaults).toEqual({
      projectId: "507f1f77bcf86cd799439011",
    });
  });
});
