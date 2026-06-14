import "server-only";

import { isCanonicalSessionUserId } from "@/lib/session-user-id";
import { findUserByEmail } from "@/server/repositories/users";

/**
 * Resolve the canonical DB user id for JWT `sub`.
 * OAuth profiles supply a transient random `user.id`; prefer the DB record by email.
 */
export async function resolveJwtSub(input: {
  userId?: string | null;
  email?: string | null;
}): Promise<string | undefined> {
  if (input.email) {
    const dbUser = await findUserByEmail(input.email);

    if (dbUser) {
      return dbUser.id;
    }
  }

  if (input.userId && isCanonicalSessionUserId(input.userId)) {
    return input.userId;
  }

  return undefined;
}
