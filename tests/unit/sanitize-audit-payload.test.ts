import { describe, expect, it } from "vitest";

import { sanitizeAuditPayload } from "@/server/audit/sanitize-audit-payload";

describe("sanitizeAuditPayload", () => {
  it("redacts sensitive keys", () => {
    const result = sanitizeAuditPayload({
      apiKeyHash: "hash-value",
      passwordHash: "secret",
      name: "Demo",
      nested: {
        storageKey: "key/path",
        label: "safe",
      },
    });

    expect(result).toEqual({
      apiKeyHash: "[redacted]",
      passwordHash: "[redacted]",
      name: "Demo",
      nested: {
        storageKey: "[redacted]",
        label: "safe",
      },
    });
  });
});
