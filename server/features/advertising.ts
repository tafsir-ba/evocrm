import "server-only";

import { isAdvertisingEnabled } from "@/lib/advertising-feature";
import { AppError } from "@/server/errors";

export function assertAdvertisingEnabled(): void {
  if (!isAdvertisingEnabled()) {
    throw new AppError("CONFLICT", "Advertising is currently unavailable.", {
      details: { feature: "advertising", enabled: false },
    });
  }
}
