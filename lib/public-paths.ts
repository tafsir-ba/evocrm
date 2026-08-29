/**
 * Paths accessible without an authenticated session.
 * Used by middleware and tests — keep in sync.
 */
export const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth",
  "/unsubscribe",
  "/api/unsubscribe",
  "/api/integrations/website/leads",
  "/api/integrations/hubspot/webhooks",
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
