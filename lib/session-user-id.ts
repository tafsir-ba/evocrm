const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

/** Canonical EvoCRM session user ids are MongoDB ObjectId strings. */
export function isCanonicalSessionUserId(
  userId: string | undefined | null,
): boolean {
  return typeof userId === "string" && OBJECT_ID_PATTERN.test(userId);
}

export const LOGIN_PATH = "/login";

/**
 * NextAuth GET `/api/auth/signout` renders a confirmation page
 * ("Are you sure you want to sign out?"). Never send sign-in visitors there.
 * Stale/invalid JWTs are cleared by this route handler (no confirmation UI).
 */
export const CLEAR_INVALID_SESSION_PATH = "/api/auth/clear-session";

/**
 * Where a page should send a visitor who has no usable session.
 * Missing session → login. Non-canonical JWT subject → silent clear then login.
 */
export function pageRedirectForMissingOrInvalidSession(
  sessionUserId: string | undefined | null,
): typeof LOGIN_PATH | typeof CLEAR_INVALID_SESSION_PATH {
  if (sessionUserId && !isCanonicalSessionUserId(sessionUserId)) {
    return CLEAR_INVALID_SESSION_PATH;
  }

  return LOGIN_PATH;
}
