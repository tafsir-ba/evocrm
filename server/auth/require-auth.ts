import "server-only";

import { AppError } from "@/server/errors";

import { getSession } from "./session";
import type { AppSession } from "./types";

/**
 * Require an authenticated session for API routes and server actions.
 * Implemented in Phase 2.
 */
export async function requireAuth(): Promise<AppSession> {
  const session = await getSession();

  if (!session) {
    throw new AppError("UNAUTHENTICATED", "Authentication required.");
  }

  return session;
}
