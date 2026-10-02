import "server-only";

import { AppError } from "@/server/errors";
import {
  connectionCredentialVault,
  decryptOpaqueCredentials,
  encryptOpaqueCredentials,
} from "@/server/security/credential-vault";

/** @deprecated Prefer encryptOpaqueCredentials / connectionCredentialVault — alias kept for HubSpot callers. */
export const encryptIntegrationCredentials = encryptOpaqueCredentials;

/** @deprecated Prefer decryptOpaqueCredentials / connectionCredentialVault — alias kept for HubSpot callers. */
export const decryptIntegrationCredentials = decryptOpaqueCredentials;

/**
 * HubSpot Private App credentials.
 * `clientSecret` is optional for historical/migration (token-only) connects.
 * Live webhook signature verification requires a non-empty client secret.
 */
export type HubSpotIntegrationCredentials = {
  accessToken: string;
  clientSecret: string | null;
  portalId: string;
};

export function encodeHubSpotCredentials(
  credentials: HubSpotIntegrationCredentials,
): string {
  return connectionCredentialVault.encrypt(
    JSON.stringify({
      accessToken: credentials.accessToken,
      clientSecret: credentials.clientSecret,
      portalId: credentials.portalId,
    }),
  );
}

export function decodeHubSpotCredentials(
  payload: string | null | undefined,
): HubSpotIntegrationCredentials {
  if (!payload) {
    throw new AppError("VALIDATION_ERROR", "HubSpot credentials are not configured.");
  }

  const parsed = JSON.parse(connectionCredentialVault.decrypt(payload)) as Partial<{
    accessToken: unknown;
    clientSecret: unknown;
    portalId: unknown;
  }>;

  if (
    typeof parsed.accessToken !== "string" ||
    !parsed.accessToken.trim() ||
    typeof parsed.portalId !== "string" ||
    !parsed.portalId.trim()
  ) {
    throw new AppError("INTERNAL_ERROR", "HubSpot credentials are incomplete.", {
      expose: false,
    });
  }

  const clientSecret =
    typeof parsed.clientSecret === "string" && parsed.clientSecret.trim()
      ? parsed.clientSecret.trim()
      : null;

  return {
    accessToken: parsed.accessToken.trim(),
    clientSecret,
    portalId: parsed.portalId.trim(),
  };
}

/** Require client secret for webhook signature verification. */
export function requireHubSpotClientSecret(
  credentials: HubSpotIntegrationCredentials,
): string {
  if (!credentials.clientSecret) {
    throw new AppError(
      "VALIDATION_ERROR",
      "HubSpot client secret is not configured. Live webhooks are disabled until a client secret is saved.",
    );
  }

  return credentials.clientSecret;
}
