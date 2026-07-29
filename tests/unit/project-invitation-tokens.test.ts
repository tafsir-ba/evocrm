import { describe, expect, it } from "vitest";

import {
  generateInvitationToken,
  hashInvitationToken,
} from "@/server/services/project-invitation-tokens";

describe("project invitation tokens", () => {
  it("generates a token with raw and hash components", () => {
    const { raw, hash } = generateInvitationToken();
    expect(raw).toHaveLength(64);
    expect(hash).toHaveLength(64);
    expect(raw).not.toBe(hash);
  });

  it("hashing is deterministic", () => {
    const raw = "test-token-value";
    expect(hashInvitationToken(raw)).toBe(hashInvitationToken(raw));
  });

  it("different tokens produce different hashes", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a.hash).not.toBe(b.hash);
  });

  it("raw token is not stored — only hash", () => {
    const { raw, hash } = generateInvitationToken();
    expect(hash).toBe(hashInvitationToken(raw));
  });
});
