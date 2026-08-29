import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findIntegrationById } from "@/server/repositories/integrations";
import {
  listHubSpotProjectMappings,
  updateHubSpotProjectMapping,
  upsertHubSpotProjectMappingInventory,
  type HubSpotProjectMappingRecord,
  type HubSpotProjectMappingStatus,
} from "@/server/repositories/hubspot-project-mappings";
import { findProjectById } from "@/server/repositories/projects";
import { decodeHubSpotCredentials } from "@/server/security/integration-credentials";
import {
  listHubSpotProjects,
  probeHubSpotCapabilities,
  type HubSpotCapabilityProbeResult,
} from "@/server/services/hubspot-client";

async function requireActiveHubSpotIntegration(workspaceId: string, integrationId: string) {
  const integration = await findIntegrationById(workspaceId, integrationId);

  if (!integration || integration.archivedAt || integration.type !== "hubspot") {
    throw new AppError("NOT_FOUND", "HubSpot integration not found.");
  }

  if (!integration.credentialsEncrypted) {
    throw new AppError("VALIDATION_ERROR", "HubSpot credentials are not configured.");
  }

  return integration;
}

export async function probeHubSpotIntegrationForWorkspace(
  workspaceId: string,
  integrationId: string,
  actorId: string,
): Promise<HubSpotCapabilityProbeResult> {
  const integration = await requireActiveHubSpotIntegration(workspaceId, integrationId);
  const credentials = decodeHubSpotCredentials(integration.credentialsEncrypted);
  const result = await probeHubSpotCapabilities(credentials.accessToken);

  await createAuditLog({
    workspaceId,
    actorId,
    action: "integration.hubspot_probe",
    entityType: "integration",
    entityId: integration.id,
    after: {
      ok: result.ok,
      checks: result.checks.map((check) => ({
        key: check.key,
        ok: check.ok,
        statusCode: check.statusCode,
      })),
    },
  });

  return result;
}

export async function refreshHubSpotProjectInventoryForWorkspace(
  workspaceId: string,
  integrationId: string,
  actorId: string,
): Promise<{ mappings: HubSpotProjectMappingRecord[]; hubspotProjectCount: number }> {
  const integration = await requireActiveHubSpotIntegration(workspaceId, integrationId);
  const credentials = decodeHubSpotCredentials(integration.credentialsEncrypted);
  const projects = await listHubSpotProjects({ accessToken: credentials.accessToken });

  const mappings = await upsertHubSpotProjectMappingInventory({
    workspaceId,
    integrationId,
    projects: projects.map((project) => ({
      hubspotProjectId: project.id,
      hubspotProjectName: project.name,
    })),
  });

  await createAuditLog({
    workspaceId,
    actorId,
    action: "integration.hubspot_projects_refreshed",
    entityType: "integration",
    entityId: integration.id,
    after: {
      hubspotProjectCount: projects.length,
      mappingCount: mappings.length,
    },
  });

  return { mappings, hubspotProjectCount: projects.length };
}

export async function listHubSpotProjectMappingsForWorkspace(
  workspaceId: string,
  integrationId: string,
): Promise<HubSpotProjectMappingRecord[]> {
  await requireActiveHubSpotIntegration(workspaceId, integrationId);
  return listHubSpotProjectMappings(workspaceId, integrationId);
}

export async function saveHubSpotProjectMappingForWorkspace(input: {
  workspaceId: string;
  integrationId: string;
  actorId: string;
  hubspotProjectId: string;
  status: HubSpotProjectMappingStatus;
  evoProjectId: string | null;
}): Promise<HubSpotProjectMappingRecord> {
  await requireActiveHubSpotIntegration(input.workspaceId, input.integrationId);

  if (input.status === "mapped") {
    if (!input.evoProjectId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Choose an Evohome destination project before marking a mapping as mapped.",
      );
    }

    const project = await findProjectById(input.workspaceId, input.evoProjectId);
    if (!project || project.archivedAt) {
      throw new AppError("VALIDATION_ERROR", "Destination project is missing or archived.");
    }
  }

  if (input.status === "unmapped" && input.evoProjectId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Clear the destination project when marking a mapping as unmapped.",
    );
  }

  if (input.status === "skipped") {
    // Skipped intentionally has no destination.
    input = { ...input, evoProjectId: null };
  }

  const updated = await updateHubSpotProjectMapping({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    hubspotProjectId: input.hubspotProjectId,
    status: input.status,
    evoProjectId: input.status === "mapped" ? input.evoProjectId : null,
    reviewedBy: input.actorId,
  });

  if (!updated) {
    throw new AppError(
      "NOT_FOUND",
      "HubSpot project mapping not found. Refresh project inventory first.",
    );
  }

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "integration.hubspot_project_mapping_updated",
    entityType: "integration",
    entityId: input.integrationId,
    after: {
      hubspotProjectId: updated.hubspotProjectId,
      hubspotProjectName: updated.hubspotProjectName,
      status: updated.status,
      evoProjectId: updated.evoProjectId,
    },
  });

  return updated;
}
