import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import type { DocumentLinkedEntityType } from "@/server/validation/documents";

const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

export type DocumentUploadTokenPayload = {
  uploadId: string;
  workspaceId: string;
  storageKey: string;
  linkedEntityType: DocumentLinkedEntityType;
  linkedEntityId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  visibility: "private" | "workspace";
  ownerId?: string;
  uploadedBy: string;
  expiresAt: number;
};

function getSigningSecret(): string {
  const env = getEnv();

  if (!env.NEXTAUTH_SECRET) {
    if (env.NODE_ENV === "test") {
      return "evocrm-document-upload-test-secret";
    }

    throw new AppError("INTERNAL_ERROR", "Upload signing is not configured.", {
      expose: false,
    });
  }

  return env.NEXTAUTH_SECRET;
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getSigningSecret()).update(encodedPayload).digest("base64url");
}

export function createDocumentUploadToken(
  payload: Omit<DocumentUploadTokenPayload, "uploadId" | "expiresAt">,
): { uploadId: string; expiresAt: Date } {
  const uploadId = randomUUID();
  const expiresAt = Date.now() + UPLOAD_TOKEN_TTL_MS;

  const tokenPayload: DocumentUploadTokenPayload = {
    ...payload,
    uploadId,
    expiresAt,
  };

  const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString("base64url");
  const signature = signPayload(encodedPayload);
  const uploadToken = `${encodedPayload}.${signature}`;

  return { uploadId: uploadToken, expiresAt: new Date(expiresAt) };
}

export function verifyDocumentUploadToken(uploadId: string): DocumentUploadTokenPayload {
  const parts = uploadId.split(".");

  if (parts.length !== 2) {
    throw new AppError("VALIDATION_ERROR", "Invalid upload token.");
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = signPayload(encodedPayload);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new AppError("VALIDATION_ERROR", "Invalid upload token.");
  }

  let payload: DocumentUploadTokenPayload;

  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as DocumentUploadTokenPayload;
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid upload token.");
  }

  if (Date.now() > payload.expiresAt) {
    throw new AppError("VALIDATION_ERROR", "Upload token has expired.");
  }

  return payload;
}
