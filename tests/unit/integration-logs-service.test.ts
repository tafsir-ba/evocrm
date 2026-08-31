import { describe, expect, it } from "vitest";

import { sanitizeIntegrationLogError, sanitizePayloadSummary } from "@/server/services/integration-logs";

describe("integration logs", () => {
  it("sanitizes payload summaries and avoids storing secrets", () => {
    const summary = sanitizePayloadSummary({
      externalId: "form-1",
      emailPresent: true,
      apiKey: "secret-should-not-appear-as-object",
      email: "hidden@example.com",
      nested: { bad: "value" },
    });

    expect(summary.externalId).toBe("form-1");
    expect(summary.emailPresent).toBe(true);
    expect(summary).not.toHaveProperty("apiKey");
    expect(summary).not.toHaveProperty("email");
    expect(summary).not.toHaveProperty("nested");
  });

  it("sanitizes error messages", () => {
    const message = sanitizeIntegrationLogError(new Error("Validation failed\nwith details"));
    expect(message).toBe("Validation failed with details");
  });
});
