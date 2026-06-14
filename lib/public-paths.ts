import { STALE_SESSION_RECOVERY_PATH } from "@/lib/session-user-id";

/**
 * Paths accessible without an authenticated session.
 * Used by middleware and tests — keep in sync.
 */
export const PUBLIC_PATHS = [
  "/login",
  "/signup",
  STALE_SESSION_RECOVERY_PATH,
  "/api/auth",
  "/unsubscribe",
  "/api/integrations/website/leads",
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
