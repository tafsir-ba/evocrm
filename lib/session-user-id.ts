const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

/** Canonical EvoCRM session user ids are MongoDB ObjectId strings. */
export function isCanonicalSessionUserId(
  userId: string | undefined | null,
): boolean {
  return typeof userId === "string" && OBJECT_ID_PATTERN.test(userId);
}

export const SIGN_OUT_TO_LOGIN_PATH = "/api/auth/signout?callbackUrl=%2Flogin";
