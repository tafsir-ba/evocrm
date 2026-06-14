import "server-only";

import { requireAuth } from "@/server/auth/require-auth";
import { isPlatformAdminEmail } from "@/server/auth/platform-admin";
import { AppError } from "@/server/errors";

export async function requirePlatformAdmin() {
  const session = await requireAuth();

  if (!isPlatformAdminEmail(session.user.email)) {
    throw new AppError("FORBIDDEN", "Platform admin access required.");
  }

  return session;
}
