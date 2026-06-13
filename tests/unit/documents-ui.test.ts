import { describe, expect, it } from "vitest";

import { FORBIDDEN_PRIMARY_NAV_LABELS } from "@/lib/v1-navigation";

describe("documents UI navigation guard", () => {
  it("does not include Documents in primary navigation", () => {
    expect(FORBIDDEN_PRIMARY_NAV_LABELS).toContain("Documents");
  });
});

describe("document client validation", () => {
  it("rejects unsupported file types on client", async () => {
    const { validateDocumentFileClient } = await import("@/lib/documents");
    const file = new File(["x"], "malware.exe", { type: "application/x-msdownload" });

    expect(validateDocumentFileClient(file)).toBe("Unsupported file type.");
  });

  it("rejects files above max size on client", async () => {
    const { validateDocumentFileClient, MAX_DOCUMENT_FILE_SIZE_BYTES } = await import(
      "@/lib/documents"
    );
    const bigContent = new Uint8Array(MAX_DOCUMENT_FILE_SIZE_BYTES + 1);
    const file = new File([bigContent], "big.pdf", { type: "application/pdf" });

    expect(validateDocumentFileClient(file)).toContain("maximum size");
  });
});
