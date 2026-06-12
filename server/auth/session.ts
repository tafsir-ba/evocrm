import "server-only";

import { AppError } from "@/server/errors";

import type { AppSession } from "./types";

/**
 * Resolve the current authenticated session.
 * Implemented in Phase 2 (Auth.js / NextAuth).
 */
export async function getSession(): Promise<AppSession | null> {
  throw new AppError("INTERNAL_ERROR", "Auth is not implemented yet.", {
    expose: false,
  });
}
