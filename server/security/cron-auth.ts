import "server-only";

import { AppError } from "@/server/errors";
import { getEnv } from "@/server/env";

export function requireCronAuth(request: Request): void {
  const env = getEnv();

  if (!env.CRON_SECRET) {
    throw new AppError("UNAUTHENTICATED", "Invalid cron authorization.");
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("UNAUTHENTICATED", "Invalid cron authorization.");
  }

  const token = authHeader.slice("Bearer ".length);

  if (token !== env.CRON_SECRET) {
    throw new AppError("UNAUTHENTICATED", "Invalid cron authorization.");
  }
}
