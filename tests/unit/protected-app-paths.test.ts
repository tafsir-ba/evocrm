import { describe, expect, it } from "vitest";

import {
  isProtectedAppPath,
  shouldRedirectAuthenticatedAwayFromAuthPages,
  shouldRedirectUnauthenticatedToLogin,
} from "@/lib/protected-app-paths";

describe("isProtectedAppPath", () => {
  it("treats the CRM root as protected so sign-in visitors never hit HomePage", () => {
    expect(isProtectedAppPath("/")).toBe(true);
  });

  it("protects workspace, admin, and scoped API surfaces", () => {
    expect(isProtectedAppPath("/workspaces")).toBe(true);
    expect(isProtectedAppPath("/w/demo-agency/dashboard")).toBe(true);
    expect(isProtectedAppPath("/admin")).toBe(true);
    expect(isProtectedAppPath("/api/me")).toBe(true);
    expect(isProtectedAppPath("/api/workspaces/demo/leads")).toBe(true);
  });

  it("does not treat login or NextAuth handlers as protected app pages", () => {
    expect(isProtectedAppPath("/login")).toBe(false);
    expect(isProtectedAppPath("/signup")).toBe(false);
    expect(isProtectedAppPath("/api/auth/signin")).toBe(false);
    expect(isProtectedAppPath("/api/auth/signout")).toBe(false);
    expect(isProtectedAppPath("/api/auth/clear-session")).toBe(false);
  });
});

describe("shouldRedirectUnauthenticatedToLogin", () => {
  it("sends an unauthenticated visitor at / to login", () => {
    expect(shouldRedirectUnauthenticatedToLogin("/", false)).toBe(true);
  });

  it("does not bounce authenticated sessions off the CRM root", () => {
    expect(shouldRedirectUnauthenticatedToLogin("/", true)).toBe(false);
  });

  it("leaves the login page itself available for sign-in", () => {
    expect(shouldRedirectUnauthenticatedToLogin("/login", false)).toBe(false);
  });

  it("does not intercept explicit NextAuth sign-out", () => {
    expect(shouldRedirectUnauthenticatedToLogin("/api/auth/signout", false)).toBe(
      false,
    );
  });
});

describe("shouldRedirectAuthenticatedAwayFromAuthPages", () => {
  it("keeps signed-in users off login and signup", () => {
    expect(shouldRedirectAuthenticatedAwayFromAuthPages("/login", true)).toBe(
      true,
    );
    expect(shouldRedirectAuthenticatedAwayFromAuthPages("/signup", true)).toBe(
      true,
    );
  });

  it("does not redirect unauthenticated users away from login", () => {
    expect(shouldRedirectAuthenticatedAwayFromAuthPages("/login", false)).toBe(
      false,
    );
  });
});
