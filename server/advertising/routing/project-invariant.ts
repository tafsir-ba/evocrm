import "server-only";

import { AppError } from "@/server/errors";

/**
 * Project-routing invariant: Growth Campaign has exactly one required projectId.
 * Trusted destinations may only route leads to that project — browser cannot choose.
 */
export type TrustedDestinationInput = {
  /** Canonical landing / form URL or website integration key. */
  destinationKey: string;
  websiteIntegrationId?: string | null;
  /** Client-supplied project override — always rejected. */
  clientProjectId?: string | null;
};

export function assertGrowthCampaignProjectId(projectId: string | null | undefined): string {
  if (!projectId || typeof projectId !== "string" || !projectId.trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Growth Campaign requires an active projectId.",
      { details: { field: "projectId" } },
    );
  }
  return projectId.trim();
}

/**
 * Resolve the CRM project for an inbound paid lead from the Growth Campaign lock.
 * Ignores any browser / payload project selection.
 */
export function resolveTrustedDestinationProjectId(input: {
  growthCampaignProjectId: string;
  clientProjectId?: string | null;
}): string {
  const locked = assertGrowthCampaignProjectId(input.growthCampaignProjectId);

  if (
    input.clientProjectId &&
    input.clientProjectId.trim() &&
    input.clientProjectId.trim() !== locked
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Browser cannot choose or override the Growth Campaign project.",
      {
        details: {
          lockedProjectId: locked,
          rejectedClientProjectId: input.clientProjectId.trim(),
        },
      },
    );
  }

  return locked;
}

export function assertProjectReassignAllowed(input: {
  hasTrustedDestinations: boolean;
  allowMigrationRule?: boolean;
}): void {
  if (input.hasTrustedDestinations && !input.allowMigrationRule) {
    throw new AppError(
      "CONFLICT",
      "Cannot reassign Growth Campaign project while trusted destinations exist.",
    );
  }
}
