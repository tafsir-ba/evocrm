import { describe, expect, it } from "vitest";

import { validateImportMappingConfiguration } from "@/lib/import-mapping-validation";

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
});
