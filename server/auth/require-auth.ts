import "server-only";

import { AppError } from "@/server/errors";
import { findUserById } from "@/server/repositories/users";

import { getSession } from "./session";
import type { AppSession } from "./types";

/**
 * Require an authenticated session for API routes and server actions.
 * Resolves the DB user by session user ID (works for Google and credentials).
 */
export async function requireAuth(): Promise<AppSession> {
  const session = await getSession();

  if (!session?.user?.id) {
    throw new AppError("UNAUTHENTICATED", "Authentication required.");
  }

  const user = await findUserById(session.user.id);

  if (!user) {
    throw new AppError("UNAUTHENTICATED", "Authentication required.");
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
  };
}
