import { describe, expect, it, vi } from "vitest";

import { captureError } from "@/server/observability/capture-error";

describe("captureError", () => {
  it("redacts sensitive context without throwing", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    captureError(new Error("api_key=super-secret"), {
      code: "TEST",
      tags: { apiKey: "raw-key" },
    });

    expect(consoleSpy).toHaveBeenCalled();
    const payload = consoleSpy.mock.calls[0]?.[0] as string;
    expect(payload).toContain("[evocrm:error]");
    expect(payload).not.toContain("super-secret");

    consoleSpy.mockRestore();
  });
});
