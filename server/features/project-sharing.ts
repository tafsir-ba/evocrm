import "server-only";

import { AppError } from "@/server/errors";
import { PROJECT_SHARING_ENABLED } from "@/lib/project-sharing-feature";

export function assertProjectSharingEnabled(): void {
  if (!PROJECT_SHARING_ENABLED) {
    throw new AppError(
      "CONFLICT",
      "Project sharing is temporarily unavailable until project-scoped authorization is fully enforced.",
    );
  }
}
