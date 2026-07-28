import { describe, expect, it } from "vitest";

import { buildLeadEmailProjectKey } from "@/server/repositories/leads";

describe("buildLeadEmailProjectKey", () => {
  it("builds a stable project+email composite key for import dedupe", () => {
    expect(buildLeadEmailProjectKey("project-a", "ada@example.com")).toBe(
      "project-a::ada@example.com",
    );
  });
});
