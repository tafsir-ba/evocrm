import { describe, expect, it } from "vitest";

import {
  CLEAR_INVALID_SESSION_PATH,
  isCanonicalSessionUserId,
  LOGIN_PATH,
  pageRedirectForMissingOrInvalidSession,
} from "@/lib/session-user-id";

describe("isCanonicalSessionUserId", () => {
  it("accepts MongoDB ObjectId strings", () => {
    expect(isCanonicalSessionUserId("507f1f77bcf86cd799439011")).toBe(true);
  });

  it("rejects OAuth UUIDs and other non-ObjectId values", () => {
    expect(isCanonicalSessionUserId("550e8400-e29b-41d4-a716-446655440000")).toBe(
      false,
    );
    expect(isCanonicalSessionUserId("")).toBe(false);
    expect(isCanonicalSessionUserId(undefined)).toBe(false);
  });
});

describe("pageRedirectForMissingOrInvalidSession", () => {
  it("sends visitors with no session to login, not NextAuth sign-out confirmation", () => {
    expect(pageRedirectForMissingOrInvalidSession(undefined)).toBe(LOGIN_PATH);
    expect(pageRedirectForMissingOrInvalidSession(null)).toBe(LOGIN_PATH);
    expect(pageRedirectForMissingOrInvalidSession("")).toBe(LOGIN_PATH);
    expect(LOGIN_PATH).toBe("/login");
    expect(LOGIN_PATH).not.toMatch(/signout/i);
  });

  it("sends non-canonical JWT subjects to the silent clear route", () => {
    expect(
      pageRedirectForMissingOrInvalidSession(
        "550e8400-e29b-41d4-a716-446655440000",
      ),
    ).toBe(CLEAR_INVALID_SESSION_PATH);
    expect(CLEAR_INVALID_SESSION_PATH).toBe("/api/auth/clear-session");
    expect(CLEAR_INVALID_SESSION_PATH).not.toMatch(/signout/i);
  });

  it("does not treat a canonical id as missing — pages load the user next", () => {
    expect(
      pageRedirectForMissingOrInvalidSession("507f1f77bcf86cd799439011"),
    ).toBe(LOGIN_PATH);
  });
});
