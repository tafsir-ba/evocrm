import { describe, expect, it } from "vitest";

import { isPermanentResendBounce } from "@/server/utils/resend-bounce";

describe("isPermanentResendBounce", () => {
  it("treats Permanent and Hard bounce types as permanent", () => {
    expect(isPermanentResendBounce({ type: "Permanent" })).toBe(true);
    expect(isPermanentResendBounce({ type: "Hard" })).toBe(true);
  });

  it("treats Transient and soft bounce types as non-permanent", () => {
    expect(
      isPermanentResendBounce({ type: "Transient", subType: "MailboxFull" }),
    ).toBe(false);
    expect(isPermanentResendBounce({ type: "Temporary" })).toBe(false);
    expect(isPermanentResendBounce({ type: "soft" })).toBe(false);
  });

  it("defaults to permanent when bounce details are missing", () => {
    expect(isPermanentResendBounce(undefined)).toBe(true);
    expect(isPermanentResendBounce({})).toBe(true);
  });
});
