import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOGIN_CALLBACK_URL,
  normalizeLoginCallbackUrl,
} from "@/lib/auth-callback-url";

describe("normalizeLoginCallbackUrl", () => {
  it("falls back when no callback URL is provided", () => {
    expect(normalizeLoginCallbackUrl(undefined)).toBe(
      DEFAULT_LOGIN_CALLBACK_URL,
    );
    expect(normalizeLoginCallbackUrl(null)).toBe(DEFAULT_LOGIN_CALLBACK_URL);
  });

  it("keeps safe app-relative callback URLs", () => {
    expect(normalizeLoginCallbackUrl("/workspaces")).toBe("/workspaces");
    expect(normalizeLoginCallbackUrl("/w/demo/dashboard?tab=open#today")).toBe(
      "/w/demo/dashboard?tab=open#today",
    );
  });

  it("rejects external and protocol-relative callback URLs", () => {
    expect(normalizeLoginCallbackUrl("https://example.com/workspaces")).toBe(
      DEFAULT_LOGIN_CALLBACK_URL,
    );
    expect(normalizeLoginCallbackUrl("//example.com/workspaces")).toBe(
      DEFAULT_LOGIN_CALLBACK_URL,
    );
  });

  it("rejects auth, API, and recovery callback URLs", () => {
    expect(
      normalizeLoginCallbackUrl("/api/auth/signout?callbackUrl=%2Flogin"),
    ).toBe(DEFAULT_LOGIN_CALLBACK_URL);
    expect(normalizeLoginCallbackUrl("/api/me")).toBe(
      DEFAULT_LOGIN_CALLBACK_URL,
    );
    expect(normalizeLoginCallbackUrl("/auth/session-expired")).toBe(
      DEFAULT_LOGIN_CALLBACK_URL,
    );
    expect(normalizeLoginCallbackUrl("/login")).toBe(
      DEFAULT_LOGIN_CALLBACK_URL,
    );
  });
});
