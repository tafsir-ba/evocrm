import "server-only";

import { AppError } from "@/server/errors";
import { connectionCredentialVault } from "@/server/security/credential-vault";

export type MetaConnectionCredentials = {
  accessToken: string;
  /** Optional Business Manager id for display/routing. */
  businessId: string | null;
  /** When true, sync uses fixture client (no live Graph calls). */
  useFixture?: boolean;
};

export function encodeMetaCredentials(credentials: MetaConnectionCredentials): string {
  if (!credentials.accessToken.trim() && !credentials.useFixture) {
    throw new AppError("VALIDATION_ERROR", "A Meta access token is required.");
  }
  return connectionCredentialVault.encrypt(
    JSON.stringify({
      accessToken: credentials.accessToken.trim(),
      businessId: credentials.businessId,
      useFixture: Boolean(credentials.useFixture),
    }),
  );
}

export function decodeMetaCredentials(
  payload: string | null | undefined,
): MetaConnectionCredentials {
  if (!payload) {
    throw new AppError("VALIDATION_ERROR", "Meta credentials are not configured.");
  }
  const parsed = JSON.parse(connectionCredentialVault.decrypt(payload)) as Partial<{
    accessToken: unknown;
    businessId: unknown;
    useFixture: unknown;
  }>;

  const useFixture = parsed.useFixture === true;
  const accessToken =
    typeof parsed.accessToken === "string" ? parsed.accessToken.trim() : "";

  if (!useFixture && !accessToken) {
    throw new AppError("INTERNAL_ERROR", "Meta credentials are incomplete.", {
      expose: false,
    });
  }

  return {
    accessToken,
    businessId:
      typeof parsed.businessId === "string" && parsed.businessId.trim()
        ? parsed.businessId.trim()
        : null,
    useFixture,
  };
}
