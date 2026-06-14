import "server-only";

/** Sole platform operator account for cross-workspace admin tools. */
export const PLATFORM_ADMIN_EMAIL = "tafsir@evo-home.ch";

export function isPlatformAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL;
}
