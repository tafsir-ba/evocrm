import "server-only";

import { AppError } from "@/server/errors";
import { syncUserFromProviderProfile } from "@/server/services/users";

import { getSession } from "./session";
import type { AppSession } from "./types";

/**
 * Require an authenticated session for API routes and server actions.
 * Ensures the user exists in the database (sync from provider profile).
 */
export async function requireAuth(): Promise<AppSession> {
  const session = await getSession();

  if (!session) {
    throw new AppError("UNAUTHENTICATED", "Authentication required.");
  }

  const user = await syncUserFromProviderProfile({
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
  };
}
