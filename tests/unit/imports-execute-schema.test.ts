import { describe, expect, it } from "vitest";

import { executeImportSchema } from "@/server/validation/imports";

describe("executeImportSchema", () => {
  it("defaults triggerAutomationForImportedLeads to false", () => {
    const result = executeImportSchema.parse({ mode: "valid_rows_only" });

    expect(result.triggerAutomationForImportedLeads).toBe(false);
  });

  it("accepts triggerAutomationForImportedLeads true", () => {
    const result = executeImportSchema.parse({
      mode: "valid_rows_only",
      triggerAutomationForImportedLeads: true,
    });

    expect(result.triggerAutomationForImportedLeads).toBe(true);
  });
});
