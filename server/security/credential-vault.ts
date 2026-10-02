import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";

const ENCRYPTION_PREFIX = "evocrm_cred_v1";

export type OpaqueCredentialPayload = string;

/**
 * Platform-neutral encrypted credential vault.
 * Stores opaque ciphertext only — no platform-specific schema in core.
 * HubSpot and future AdConnection credentials share this interface.
 */
function resolveCredentialsKey(): Buffer {
  const env = getEnv();
  const material = env.NEXTAUTH_SECRET || env.INTEGRATION_API_KEY_PEPPER;

  if (!material) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Credential encryption is not configured.",
      { expose: false },
    );
  }

  return createHash("sha256").update(`evocrm-integration-credentials:${material}`).digest();
}

/** Encrypt a UTF-8 secret payload for Integration / AdConnection credentialsEncrypted. */
export function encryptOpaqueCredentials(plaintext: string): OpaqueCredentialPayload {
  const key = resolveCredentialsKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptOpaqueCredentials(payload: OpaqueCredentialPayload): string {
  const parts = payload.split(".");

  if (parts.length !== 4 || parts[0] !== ENCRYPTION_PREFIX) {
    throw new AppError("INTERNAL_ERROR", "Invalid encrypted credentials payload.", {
      expose: false,
    });
  }

  const [, ivPart, tagPart, dataPart] = parts;
  const key = resolveCredentialsKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export type ConnectionCredentialVault = {
  encrypt: (plaintext: string) => OpaqueCredentialPayload;
  decrypt: (payload: OpaqueCredentialPayload) => string;
};

export const connectionCredentialVault: ConnectionCredentialVault = {
  encrypt: encryptOpaqueCredentials,
  decrypt: decryptOpaqueCredentials,
};
