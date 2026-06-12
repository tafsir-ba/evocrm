import "server-only";

/**
 * Audit log contract — persistence implemented in a later phase.
 */

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
  | "dictionary"
  | "dictionary_item"
  | "tag"
  | "settings"
  | "integration"
  | "integration_log"
  | "billing";

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
 * Record an audit log entry.
 * Phase 0: typed no-op — not wired to production routes yet.
 * TODO(Phase 2+): persist AuditLog model and enforce in services.
 */
export async function createAuditLog(
  _input: CreateAuditLogInput,
): Promise<void> {
  // Intentional no-op until AuditLog model exists.
  return Promise.resolve();
}
