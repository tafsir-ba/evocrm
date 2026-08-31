import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { findDictionaryItemByTypeAndKey } from "@/server/repositories/dictionary-items";
import {
  findActiveLeadByEmailNormalized,
  findLeadByIntegrationIdempotencyKey,
} from "@/server/repositories/leads";
import {
  findActiveWebsiteIntegrationByApiKeyHash,
  findWebsiteIntegrationByApiKeyHash,
  type IntegrationRecord,
} from "@/server/repositories/integrations";
import { ensureDefaultDictionaries } from "@/server/services/default-dictionaries";
import {
  buildWebsiteLeadPayloadSummary,
  writeIntegrationLog,
} from "@/server/services/integration-logs";
import {
  hashIntegrationApiKey,
  parseIntegrationApiKeyFromRequest,
} from "@/server/services/integration-api-keys";
import {
  createLeadForWorkspace,
  normalizeLeadEmail,
} from "@/server/services/leads";
import { resolveOrCreateCompanyByName } from "@/server/services/companies";
import {
  findProjectById,
  findProjectByReference,
  findProjects,
} from "@/server/repositories/projects";
import type { WebsiteLeadCaptureInput } from "@/server/validation/website-lead-capture";

export type WebsiteLeadCaptureResult = {
  leadId: string;
  duplicate: boolean;
  idempotent: boolean;
};

export async function resolveWebsiteLeadProjectId(input: {
  workspaceId: string;
  integration: IntegrationRecord;
  payload: Pick<WebsiteLeadCaptureInput, "projectId" | "projectReference">;
}): Promise<string> {
  const { workspaceId, integration, payload } = input;
  const allowOverride = integration.allowProjectOverride === true;
  const hasPayloadProjectId = Boolean(payload.projectId);
  const hasPayloadProjectReference = Boolean(payload.projectReference?.trim());

  if (hasPayloadProjectId && hasPayloadProjectReference) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Provide either projectId or projectReference, not both.",
    );
  }

  if (!allowOverride && (hasPayloadProjectId || hasPayloadProjectReference)) {
    const lockedProjectId = await resolveLockedDefaultProjectId(workspaceId, integration);

    if (payload.projectId && payload.projectId !== lockedProjectId) {
      throw new AppError(
        "FORBIDDEN",
        "This website integration is locked to its default project. Remove projectId from the payload, or enable project override in CRM settings.",
      );
    }

    if (payload.projectReference?.trim()) {
      const project = await findProjectByReference(
        workspaceId,
        payload.projectReference.trim(),
      );

      if (!project || project.archivedAt || project.id !== lockedProjectId) {
        throw new AppError(
          "FORBIDDEN",
          "This website integration is locked to its default project. Remove projectReference from the payload, or enable project override in CRM settings.",
        );
      }
    }

    return lockedProjectId;
  }

  if (payload.projectId) {
    const project = await findProjectById(workspaceId, payload.projectId);

    if (!project || project.archivedAt) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Project must exist in this workspace and not be archived.",
      );
    }

    return project.id;
  }

  if (payload.projectReference?.trim()) {
    const project = await findProjectByReference(
      workspaceId,
      payload.projectReference.trim(),
    );

    if (!project || project.archivedAt) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Project reference must match an active project in this workspace.",
      );
    }

    return project.id;
  }

  return resolveLockedDefaultProjectId(workspaceId, integration);
}

async function resolveLockedDefaultProjectId(
  workspaceId: string,
  integration: IntegrationRecord,
): Promise<string> {
  if (integration.defaultProjectId) {
    const project = await findProjectById(workspaceId, integration.defaultProjectId);

    if (!project || project.archivedAt) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Integration default project is missing or archived. Configure a valid default project.",
      );
    }

    return project.id;
  }

  const projects = await findProjects(workspaceId, { includeArchived: false });

  if (projects.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "At least one active project is required before website leads can be captured.",
    );
  }

  if (projects.length === 1) {
    return projects[0].id;
  }

  throw new AppError(
    "VALIDATION_ERROR",
    "Multiple active projects exist. Set a default project on the website integration, or enable project override and provide projectId or projectReference in the payload.",
  );
}

function resolveIdempotencyKey(input: WebsiteLeadCaptureInput): string | null {
  const key = input.idempotencyKey?.trim() || input.externalId?.trim();
  return key || null;
}

function buildIntegrationAttributes(
  integration: IntegrationRecord,
  input: WebsiteLeadCaptureInput,
  idempotencyKey: string | null,
): Record<string, unknown> {
  const integrationAttributes: Record<string, unknown> = {
    integrationId: integration.id,
  };

  if (input.externalId?.trim()) {
    integrationAttributes.externalId = input.externalId.trim();
  }

  if (idempotencyKey) {
    integrationAttributes.idempotencyKey = idempotencyKey;
  }

  if (input.utm) {
    integrationAttributes.utm = input.utm;
  }

  if (input.propertyReference?.trim()) {
    integrationAttributes.propertyReference = input.propertyReference.trim();
  }

  if (input.source?.trim()) {
    integrationAttributes.inboundSource = input.source.trim();
  }

  integrationAttributes.receivedAt = new Date().toISOString();

  return { integration: integrationAttributes };
}

async function resolveWebsiteLeadSourceId(workspaceId: string): Promise<string | null> {
  const source = await findDictionaryItemByTypeAndKey(workspaceId, "lead_source", "website");
  return source?.isActive ? source.id : null;
}

async function resolveDefaultLeadStatusId(workspaceId: string): Promise<string> {
  const status = await findDictionaryItemByTypeAndKey(workspaceId, "lead_status", "new");

  if (!status || !status.isActive) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Default lead status is not configured for this workspace.",
      { expose: false },
    );
  }

  return status.id;
}

export async function resolveWebsiteIntegrationFromApiKey(
  rawApiKey: string,
): Promise<IntegrationRecord> {
  if (!rawApiKey) {
    throw new AppError("UNAUTHENTICATED", "Invalid or missing API key.");
  }

  const apiKeyHash = hashIntegrationApiKey(rawApiKey);
  const activeIntegration = await findActiveWebsiteIntegrationByApiKeyHash(apiKeyHash);

  if (activeIntegration) {
    return activeIntegration;
  }

  const existingIntegration = await findWebsiteIntegrationByApiKeyHash(apiKeyHash);

  if (existingIntegration) {
    throw new AppError("FORBIDDEN", "Integration is not active.");
  }

  throw new AppError("UNAUTHENTICATED", "Invalid or missing API key.");
}

export async function captureWebsiteLead(
  rawApiKey: string,
  input: WebsiteLeadCaptureInput,
): Promise<WebsiteLeadCaptureResult> {
  const integration = await resolveWebsiteIntegrationFromApiKey(rawApiKey);
  const workspaceId = integration.workspaceId;
  const idempotencyKey = resolveIdempotencyKey(input);

  await createAuditLog({
    workspaceId,
    actorId: integration.createdBy,
    action: "integration.website_lead_received",
    entityType: "integration",
    entityId: integration.id,
    after: buildWebsiteLeadPayloadSummary({
      externalId: input.externalId,
      email: input.email,
      phone: input.phone,
      source: input.source,
    }),
  });

  if (idempotencyKey) {
    const existingByIdempotency = await findLeadByIntegrationIdempotencyKey(
      workspaceId,
      integration.id,
      idempotencyKey,
    );

    if (existingByIdempotency) {
      await writeIntegrationLog({
        workspaceId,
        integrationId: integration.id,
        direction: "inbound",
        status: "success",
        eventType: "website.lead.duplicate",
        payloadSummary: buildWebsiteLeadPayloadSummary({
          externalId: input.externalId,
          email: input.email,
          phone: input.phone,
          leadId: existingByIdempotency.id,
          idempotent: true,
        }),
      });

      await createAuditLog({
        workspaceId,
        actorId: integration.createdBy,
        action: "integration.website_lead_duplicate",
        entityType: "lead",
        entityId: existingByIdempotency.id,
      });

      return {
        leadId: existingByIdempotency.id,
        duplicate: true,
        idempotent: true,
      };
    }
  }

  await ensureDefaultDictionaries(workspaceId, integration.createdBy);

  const projectId = await resolveWebsiteLeadProjectId({
    workspaceId,
    integration,
    payload: {
      projectId: input.projectId,
      projectReference: input.projectReference,
    },
  });

  const emailFields = input.email ? normalizeLeadEmail(input.email) : null;

  if (emailFields?.emailNormalized) {
    const duplicateLead = await findActiveLeadByEmailNormalized(
      workspaceId,
      emailFields.emailNormalized,
      undefined,
      projectId,
    );

    if (duplicateLead) {
      await writeIntegrationLog({
        workspaceId,
        integrationId: integration.id,
        direction: "inbound",
        status: "success",
        eventType: "website.lead.duplicate",
        payloadSummary: buildWebsiteLeadPayloadSummary({
          externalId: input.externalId,
          email: input.email,
          phone: input.phone,
          leadId: duplicateLead.id,
          duplicate: true,
        }),
      });

      await createAuditLog({
        workspaceId,
        actorId: integration.createdBy,
        action: "integration.website_lead_duplicate",
        entityType: "lead",
        entityId: duplicateLead.id,
      });

      return {
        leadId: duplicateLead.id,
        duplicate: true,
        idempotent: false,
      };
    }
  }

  const statusId = await resolveDefaultLeadStatusId(workspaceId);
  const sourceId = await resolveWebsiteLeadSourceId(workspaceId);
  const attributes = buildIntegrationAttributes(integration, input, idempotencyKey);

  let result;

  try {
    const resolvedCompany = await resolveOrCreateCompanyByName(
      workspaceId,
      integration.createdBy,
      input.companyName,
    );

    result = await createLeadForWorkspace(
      workspaceId,
      integration.createdBy,
      {
        projectId,
        statusId,
        sourceId: sourceId ?? undefined,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        budgetMin: input.budgetMin,
        budgetMax: input.budgetMax,
        preferredAreas: input.preferredAreas,
        notes: input.message,
        emailConsentStatus: input.emailConsentStatus,
        attributes,
        industry: input.industry,
        jobTitle: input.jobTitle,
        stateRegion: input.stateRegion,
        companyId: resolvedCompany?.company.id,
      },
      {
        intelligenceMethod: "website",
        intelligenceSource: "website_lead_capture",
      },
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "CONFLICT") {
      if (idempotencyKey) {
        const duplicateLead = await findLeadByIntegrationIdempotencyKey(
          workspaceId,
          integration.id,
          idempotencyKey,
        );

        if (duplicateLead) {
          await writeIntegrationLog({
            workspaceId,
            integrationId: integration.id,
            direction: "inbound",
            status: "success",
            eventType: "website.lead.duplicate",
            payloadSummary: buildWebsiteLeadPayloadSummary({
              externalId: input.externalId,
              email: input.email,
              phone: input.phone,
              leadId: duplicateLead.id,
              idempotent: true,
            }),
          });

          await createAuditLog({
            workspaceId,
            actorId: integration.createdBy,
            action: "integration.website_lead_duplicate",
            entityType: "lead",
            entityId: duplicateLead.id,
          });

          return {
            leadId: duplicateLead.id,
            duplicate: true,
            idempotent: true,
          };
        }
      }

      if (emailFields?.emailNormalized) {
        const duplicateLead = await findActiveLeadByEmailNormalized(
          workspaceId,
          emailFields.emailNormalized,
          undefined,
          projectId,
        );

        if (duplicateLead) {
          await writeIntegrationLog({
            workspaceId,
            integrationId: integration.id,
            direction: "inbound",
            status: "success",
            eventType: "website.lead.duplicate",
            payloadSummary: buildWebsiteLeadPayloadSummary({
              externalId: input.externalId,
              email: input.email,
              phone: input.phone,
              leadId: duplicateLead.id,
              duplicate: true,
            }),
          });

          await createAuditLog({
            workspaceId,
            actorId: integration.createdBy,
            action: "integration.website_lead_duplicate",
            entityType: "lead",
            entityId: duplicateLead.id,
          });

          return {
            leadId: duplicateLead.id,
            duplicate: true,
            idempotent: false,
          };
        }
      }
    }

    throw error;
  }

  await writeIntegrationLog({
    workspaceId,
    integrationId: integration.id,
    direction: "inbound",
    status: "success",
    eventType: "website.lead.created",
    payloadSummary: buildWebsiteLeadPayloadSummary({
      externalId: input.externalId,
      email: input.email,
      phone: input.phone,
      source: sourceId ? "website" : "website_source_missing",
      leadId: result.lead.id,
    }),
  });

  await createAuditLog({
    workspaceId,
    actorId: integration.createdBy,
    action: "integration.website_lead_created",
    entityType: "lead",
    entityId: result.lead.id,
  });

  return {
    leadId: result.lead.id,
    duplicate: false,
    idempotent: false,
  };
}

export async function captureWebsiteLeadFromRequest(
  request: Request,
  input: WebsiteLeadCaptureInput,
): Promise<WebsiteLeadCaptureResult> {
  const rawApiKey = parseIntegrationApiKeyFromRequest(request);

  if (!rawApiKey) {
    throw new AppError("UNAUTHENTICATED", "Invalid or missing API key.");
  }

  try {
    return await captureWebsiteLead(rawApiKey, input);
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") {
      throw error;
    }

    const apiKeyHash = hashIntegrationApiKey(rawApiKey);
    const integration = await findWebsiteIntegrationByApiKeyHash(apiKeyHash);

    if (integration) {
      await writeIntegrationLog({
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        direction: "inbound",
        status: "failed",
        eventType: "website.lead.failed",
        payloadSummary: buildWebsiteLeadPayloadSummary({
          externalId: input.externalId,
          email: input.email,
          phone: input.phone,
        }),
        error,
      });

      await createAuditLog({
        workspaceId: integration.workspaceId,
        actorId: integration.createdBy,
        action: "integration.website_lead_failed",
        entityType: "integration",
        entityId: integration.id,
      });
    }

    throw error;
  }
}
