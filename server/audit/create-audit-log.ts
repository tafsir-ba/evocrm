import "server-only";

import { sanitizeAuditPayload } from "@/server/audit/sanitize-audit-payload";
import { createAuditLogRecord } from "@/server/repositories/audit-logs";
import { captureError } from "@/server/observability/capture-error";

export type AuditEntityType =
  | "workspace"
  | "membership"
  | "role"
  | "lead"
  | "property"
  | "opportunity"
  | "activity"
  | "document"
  | "campaign"
  | "campaign_step"
  | "campaign_enrollment"
  | "campaign_send"
  | "project"
  | "company"
  | "dictionary"
  | "dictionary_item"
  | "tag"
  | "settings"
  | "integration"
  | "integration_log"
  | "billing"
  | "feedback"
  | "import_job"
  | "hubspot_migration_run"
  | "project_grant"
  | "project_invitation"
  | "lead_project_membership";

export type CreateAuditLogInput = {
  workspaceId: string;
  actorId: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt?: Date;
};

/**
 * Record an audit log entry. Failures are logged but do not block the caller.
 */
export async function createAuditLog(input: CreateAuditLogInput): Promise<void> {
  try {
    await createAuditLogRecord({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: sanitizeAuditPayload(input.before),
      after: sanitizeAuditPayload(input.after),
      createdAt: input.createdAt,
    });
  } catch (error) {
    captureError(error, {
      code: "AUDIT_LOG_WRITE_FAILED",
      workspaceId: input.workspaceId,
      userId: input.actorId,
      tags: {
        action: input.action,
        entityType: input.entityType,
      },
    });
  }
}
