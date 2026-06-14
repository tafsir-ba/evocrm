import { STALE_SESSION_RECOVERY_PATH } from "@/lib/session-user-id";

export const DEFAULT_LOGIN_CALLBACK_URL = "/workspaces";

function isUnsafeLoginCallbackPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === STALE_SESSION_RECOVERY_PATH
  );
}

export function normalizeLoginCallbackUrl(
  callbackUrl: string | null | undefined,
): string {
  if (!callbackUrl || !callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return DEFAULT_LOGIN_CALLBACK_URL;
  }

  const parsed = new URL(callbackUrl, "https://evocrm.local");

  if (isUnsafeLoginCallbackPath(parsed.pathname)) {
    return DEFAULT_LOGIN_CALLBACK_URL;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
