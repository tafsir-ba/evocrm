import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { captureError } from "@/server/observability/capture-error";
import { findLeadById } from "@/server/repositories/leads";
import { findProjectById } from "@/server/repositories/projects";
import {
  getLeadEnrichmentCapability,
  startLeadEnrichment,
} from "@/server/services/lead-enrichment";

export function scheduleLeadAutoEnrichmentForLead(input: {
  workspaceId: string;
  leadId: string;
  actorId: string;
}): void {
  void Promise.resolve(evaluateLeadAutoEnrichmentForLead(input)).catch((error) => {
    logLeadAutoEnrichmentFailure(input, error);
  });
}

export async function evaluateLeadAutoEnrichmentForLead(input: {
  workspaceId: string;
  leadId: string;
  actorId: string;
}): Promise<void> {
  const lead = await findLeadById(input.workspaceId, input.leadId);
  if (!lead || lead.archivedAt || !lead.projectId) {
    return;
  }

  const project = await findProjectById(input.workspaceId, lead.projectId);
  if (!project || project.archivedAt || !project.autoEnrichLeads) {
    return;
  }

  const capability = await getLeadEnrichmentCapability(input.workspaceId);
  if (!capability.enabled) {
    await createAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "lead.auto_enrichment_skipped",
      entityType: "lead",
      entityId: lead.id,
      after: {
        reason: capability.reasonDisabled ?? "Lead enrichment is disabled.",
        projectId: lead.projectId,
      },
    });
    return;
  }

  if (!lead.email?.trim() || !lead.fullName.trim()) {
    await createAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "lead.auto_enrichment_skipped",
      entityType: "lead",
      entityId: lead.id,
      after: {
        reason: "Enrichment requires the lead’s name and email.",
        projectId: lead.projectId,
      },
    });
    return;
  }

  try {
    const run = await startLeadEnrichment({
      workspaceId: input.workspaceId,
      leadId: lead.id,
      actorId: input.actorId,
    });

    await createAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "lead.auto_enrichment_started",
      entityType: "lead",
      entityId: lead.id,
      after: {
        runId: run.id,
        status: run.status,
        projectId: lead.projectId,
      },
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION_ERROR") {
      await createAuditLog({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "lead.auto_enrichment_skipped",
        entityType: "lead",
        entityId: lead.id,
        after: {
          reason: error.message,
          projectId: lead.projectId,
        },
      });
      return;
    }
    throw error;
  }
}

export function logLeadAutoEnrichmentFailure(
  input: { workspaceId: string; leadId: string; actorId: string },
  error: unknown,
): void {
  captureError(error, {
    tags: {
      area: "lead_auto_enrichment",
      workspaceId: input.workspaceId,
      leadId: input.leadId,
    },
  });

  void createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "lead.auto_enrichment_failed",
    entityType: "lead",
    entityId: input.leadId,
    after: {
      reason: error instanceof Error ? error.message : "Unknown auto-enrichment failure.",
    },
  }).catch(() => {
    // Audit failure must not hide the original enrichment error.
  });
}
