import { describe, expect, it } from "vitest";

import { sanitizeResendTagValue, sanitizeResendTags } from "@/server/email/resend";

describe("resend tag sanitization", () => {
  it("replaces invalid characters in tag values", () => {
    expect(sanitizeResendTagValue("talal@evohome.ch")).toBe("talal_evohome_ch");
    expect(sanitizeResendTagValue("507f1f77bcf86cd799439011")).toBe(
      "507f1f77bcf86cd799439011",
    );
  });

  it("sanitizes all outbound tags", () => {
    expect(
      sanitizeResendTags([
        { name: "workspace_id", value: "ws-1" },
        { name: "to", value: "user@example.com" },
      ]),
    ).toEqual([
      { name: "workspace_id", value: "ws-1" },
      { name: "to", value: "user_example_com" },
    ]);
  });
});
