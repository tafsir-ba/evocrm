import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  createIntegration,
  findIntegrationById,
  findIntegrations,
  updateIntegration,
  type IntegrationListFilter,
  type IntegrationRecord,
  type IntegrationStatus,
  type IntegrationType,
} from "@/server/repositories/integrations";
import {
  findIntegrationLogs,
  type IntegrationLogStatus,
} from "@/server/repositories/integration-logs";
import {
  generateIntegrationApiKey,
  hashIntegrationApiKey,
} from "@/server/services/integration-api-keys";
import { validateActiveProjectId } from "@/server/services/project-scope";
import { findProjects } from "@/server/repositories/projects";
import type {
  CreateIntegrationInput,
  UpdateIntegrationInput,
} from "@/server/validation/integrations";

export type IntegrationPublicRecord = {
  id: string;
  type: IntegrationType;
  name: string;
  status: IntegrationStatus;
  hasApiKey: boolean;
  defaultProjectId: string | null;
  allowProjectOverride: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type IntegrationCreateResult = {
  integration: IntegrationPublicRecord;
  apiKey?: string;
};

function defaultStatusForType(type: IntegrationType): IntegrationStatus {
  return type === "website" ? "active" : "paused";
}

export function toIntegrationPublicRecord(
  integration: IntegrationRecord,
): IntegrationPublicRecord {
  return {
    id: integration.id,
    type: integration.type,
    name: integration.name,
    status: integration.status,
    hasApiKey: integration.type === "website" && Boolean(integration.apiKeyHash),
    defaultProjectId: integration.defaultProjectId,
    allowProjectOverride: integration.allowProjectOverride,
    createdBy: integration.createdBy,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
    archivedAt: integration.archivedAt,
  };
}

function integrationSnapshot(integration: IntegrationRecord): Record<string, unknown> {
  return {
    type: integration.type,
    name: integration.name,
    status: integration.status,
    hasApiKey: Boolean(integration.apiKeyHash),
    defaultProjectId: integration.defaultProjectId,
    allowProjectOverride: integration.allowProjectOverride,
  };
}

function auditActionForStatusChange(
  previousStatus: IntegrationStatus,
  nextStatus: IntegrationStatus,
): string {
  if (nextStatus === "paused" && previousStatus === "active") {
    return "integration.paused";
  }

  if (nextStatus === "active" && previousStatus === "paused") {
    return "integration.resumed";
  }

  if (nextStatus === "archived") {
    return "integration.archived";
  }

  return "integration.updated";
}

async function assertWebsiteDefaultProjectConfigured(
  workspaceId: string,
  defaultProjectId: string | null | undefined,
  allowProjectOverride: boolean,
): Promise<void> {
  if (allowProjectOverride) {
    return;
  }

  if (defaultProjectId) {
    return;
  }

  const projects = await findProjects(workspaceId, { includeArchived: false });

  if (projects.length > 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Set a default project for this website integration when the workspace has multiple active projects.",
    );
  }
}

export async function listIntegrationsForWorkspace(
  workspaceId: string,
  filter: IntegrationListFilter = {},
): Promise<IntegrationPublicRecord[]> {
  const integrations = await findIntegrations(workspaceId, filter);
  return integrations.map(toIntegrationPublicRecord);
}

export async function getIntegrationForWorkspace(
  workspaceId: string,
  integrationId: string,
): Promise<IntegrationPublicRecord> {
  const integration = await findIntegrationById(workspaceId, integrationId);

  if (!integration) {
    throw new AppError("NOT_FOUND", "Integration not found.");
  }

  return toIntegrationPublicRecord(integration);
}

export async function createIntegrationForWorkspace(
  workspaceId: string,
  actorId: string,
  input: CreateIntegrationInput,
): Promise<IntegrationCreateResult> {
  let apiKeyHash: string | null = null;
  let rawApiKey: string | undefined;

  if (input.type === "website") {
    rawApiKey = generateIntegrationApiKey();
    apiKeyHash = hashIntegrationApiKey(rawApiKey);
  }

  if (input.defaultProjectId) {
    await validateActiveProjectId(workspaceId, input.defaultProjectId);
  }

  const allowProjectOverride =
    input.type === "website" ? (input.allowProjectOverride ?? false) : false;
  const defaultProjectId =
    input.type === "website" ? (input.defaultProjectId ?? null) : null;

  if (input.type === "website") {
    await assertWebsiteDefaultProjectConfigured(
      workspaceId,
      defaultProjectId,
      allowProjectOverride,
    );
  }

  const integration = await createIntegration({
    workspaceId,
    type: input.type,
    name: input.name,
    status: defaultStatusForType(input.type),
    apiKeyHash,
    defaultProjectId,
    allowProjectOverride,
    createdBy: actorId,
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "integration.created",
    entityType: "integration",
    entityId: integration.id,
    after: integrationSnapshot(integration),
  });

  return {
    integration: toIntegrationPublicRecord(integration),
    ...(rawApiKey ? { apiKey: rawApiKey } : {}),
  };
}

export async function updateIntegrationForWorkspace(
  workspaceId: string,
  integrationId: string,
  actorId: string,
  input: UpdateIntegrationInput,
): Promise<IntegrationPublicRecord> {
  const existing = await findIntegrationById(workspaceId, integrationId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Integration not found.");
  }

  if (
    existing.type !== "website" &&
    (input.defaultProjectId !== undefined || input.allowProjectOverride !== undefined)
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Project routing fields are only supported for website integrations.",
    );
  }

  if (input.defaultProjectId) {
    await validateActiveProjectId(workspaceId, input.defaultProjectId);
  }

  const nextDefaultProjectId =
    input.defaultProjectId !== undefined
      ? input.defaultProjectId
      : existing.defaultProjectId;
  const nextAllowOverride =
    input.allowProjectOverride !== undefined
      ? input.allowProjectOverride
      : existing.allowProjectOverride;

  if (existing.type === "website") {
    await assertWebsiteDefaultProjectConfigured(
      workspaceId,
      nextDefaultProjectId,
      nextAllowOverride,
    );
  }

  const updated = await updateIntegration(workspaceId, integrationId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.defaultProjectId !== undefined
      ? { defaultProjectId: input.defaultProjectId }
      : {}),
    ...(input.allowProjectOverride !== undefined
      ? { allowProjectOverride: input.allowProjectOverride }
      : {}),
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Integration not found.");
  }

  const action =
    input.status !== undefined && input.status !== existing.status
      ? auditActionForStatusChange(existing.status, input.status)
      : "integration.updated";

  await createAuditLog({
    workspaceId,
    actorId,
    action,
    entityType: "integration",
    entityId: updated.id,
    before: integrationSnapshot(existing),
    after: integrationSnapshot(updated),
  });

  return toIntegrationPublicRecord(updated);
}

export async function archiveIntegrationForWorkspace(
  workspaceId: string,
  integrationId: string,
  actorId: string,
): Promise<IntegrationPublicRecord> {
  const existing = await findIntegrationById(workspaceId, integrationId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Integration not found.");
  }

  const updated = await updateIntegration(workspaceId, integrationId, {
    status: "archived",
    archivedAt: new Date(),
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Integration not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "integration.archived",
    entityType: "integration",
    entityId: updated.id,
    before: integrationSnapshot(existing),
    after: integrationSnapshot(updated),
  });

  return toIntegrationPublicRecord(updated);
}

export async function rotateIntegrationApiKeyForWorkspace(
  workspaceId: string,
  integrationId: string,
  actorId: string,
): Promise<IntegrationCreateResult> {
  const existing = await findIntegrationById(workspaceId, integrationId);

  if (!existing || existing.archivedAt) {
    throw new AppError("NOT_FOUND", "Integration not found.");
  }

  if (existing.type !== "website") {
    throw new AppError("VALIDATION_ERROR", "Only website integrations support API keys.");
  }

  const rawApiKey = generateIntegrationApiKey();
  const apiKeyHash = hashIntegrationApiKey(rawApiKey);

  const updated = await updateIntegration(workspaceId, integrationId, {
    apiKeyHash,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Integration not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId,
    action: "integration.api_key_rotated",
    entityType: "integration",
    entityId: updated.id,
    before: integrationSnapshot(existing),
    after: integrationSnapshot(updated),
  });

  return {
    integration: toIntegrationPublicRecord(updated),
    apiKey: rawApiKey,
  };
}

export async function listIntegrationLogsForWorkspace(
  workspaceId: string,
  integrationId: string,
  filter: { status?: IntegrationLogStatus; eventType?: string; limit?: number } = {},
) {
  const integration = await findIntegrationById(workspaceId, integrationId);

  if (!integration) {
    throw new AppError("NOT_FOUND", "Integration not found.");
  }

  return findIntegrationLogs(workspaceId, {
    integrationId,
    status: filter.status,
    eventType: filter.eventType,
    limit: filter.limit,
  });
}
