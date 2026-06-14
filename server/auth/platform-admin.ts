import "server-only";

import { getEnv } from "@/server/env";

function parsePlatformAdminEmails(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function getPlatformAdminEmails(): Set<string> {
  return parsePlatformAdminEmails(getEnv().PLATFORM_ADMIN_EMAILS);
}

export function isPlatformAdminEmail(email: string): boolean {
  return getPlatformAdminEmails().has(email.trim().toLowerCase());
}
