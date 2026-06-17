import { describe, expect, it } from "vitest";

import {
  collectUnknownProjectNames,
  parseUnknownProjectName,
  suggestProjectNameFromImportValue,
  suggestProjectReferenceFromImportValue,
} from "@/lib/import-project-helpers";

describe("import project helpers", () => {
  it("parses unknown project validation messages", () => {
    expect(parseUnknownProjectName('Unknown project "grosvenorvistas".')).toBe(
      "grosvenorvistas",
    );
    expect(parseUnknownProjectName("Invalid email address.")).toBeNull();
  });

  it("collects unique unknown project names from issues and error rows", () => {
    const names = collectUnknownProjectNames(
      [
        {
          rowNumber: 1,
          field: "projectId",
          message: 'Unknown project "grosvenorvistas".',
          severity: "error",
        },
        {
          rowNumber: 2,
          field: "projectId",
          message: 'Unknown project "grosvenorvistas".',
          severity: "error",
        },
      ],
      [
        {
          rowNumber: 3,
          values: { projectId: "other-project" },
          issues: [
            {
              rowNumber: 3,
              field: "projectId",
              message: 'Unknown project "other-project".',
              severity: "error",
            },
          ],
        },
      ],
    );

    expect(names).toEqual(["grosvenorvistas", "other-project"]);
  });

  it("suggests project name and reference from import values", () => {
    expect(suggestProjectNameFromImportValue("grosvenor_vistas")).toBe(
      "Grosvenor Vistas",
    );
    expect(suggestProjectReferenceFromImportValue("grosvenorvistas")).toBe(
      "grosvenorvistas",
    );
  });
});
