import "server-only";

import mongoose from "mongoose";

import { sanitizeAuditPayload } from "@/server/audit/sanitize-audit-payload";

export function serializeExportValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeExportValue(item));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = serializeExportValue(nested);
    }

    return result;
  }

  return value;
}

export function leanExportRecord(
  document: Record<string, unknown>,
): Record<string, unknown> {
  const { _id, ...rest } = document;
  return serializeExportValue({
    id: String(_id),
    ...rest,
  }) as Record<string, unknown>;
}

const EXPORT_REDACTED_FIELDS = new Set([
  "apiKeyHash",
  "credentialsEncrypted",
  "passwordHash",
  "storageKey",
  "bucket",
  "signedUrl",
]);

function sanitizeExportRecord(record: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeAuditPayload(record) ?? {};

  for (const key of EXPORT_REDACTED_FIELDS) {
    if (key in sanitized) {
      sanitized[key] = "[redacted]";
    }
  }

  return sanitized;
}

export function sanitizeExportCollection(
  records: Record<string, unknown>[],
): Record<string, unknown>[] {
  return records.map((record) => sanitizeExportRecord(record));
}

export function toExportDocumentMetadata(
  document: Record<string, unknown>,
): Record<string, unknown> {
  const {
    id,
    workspaceId,
    linkedEntityType,
    linkedEntityId,
    filename,
    mimeType,
    sizeBytes,
    status,
    uploadedBy,
    createdAt,
    updatedAt,
    archivedAt,
  } = document;

  return {
    id,
    workspaceId,
    linkedEntityType,
    linkedEntityId,
    filename,
    mimeType,
    sizeBytes,
    status,
    uploadedBy,
    createdAt,
    updatedAt,
    archivedAt,
  };
}

export function toExportIntegrationRecord(
  integration: Record<string, unknown>,
): Record<string, unknown> {
  const {
    id,
    workspaceId,
    type,
    name,
    status,
    createdBy,
    createdAt,
    updatedAt,
    archivedAt,
  } = integration;

  return {
    id,
    workspaceId,
    type,
    name,
    status,
    hasApiKey: Boolean(integration.apiKeyHash),
    createdBy,
    createdAt,
    updatedAt,
    archivedAt,
  };
}
