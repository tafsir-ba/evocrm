import "server-only";

/**
 * Canonical advertising audit-event action names.
 * Pass as createAuditLog({ action }) — keep allowlisted and stable.
 */
export const ADVERTISING_AUDIT_ACTIONS = [
  "advertising.feature_status_read",
  "ad_connection.created",
  "ad_connection.updated",
  "ad_connection.archived",
  "ad_connection.credentials_rotated",
  "ad_account.synced",
  "ad_account.updated",
  "growth_campaign.created",
  "growth_campaign.updated",
  "growth_campaign.archived",
  "growth_campaign.project_locked",
  "attribution_touchpoint.created",
  "conversion_event.created",
  "conversion_event.export_blocked",
  "conversion_event.exported",
  "advertising.approval_requested",
  "advertising.approval_granted",
  "advertising.approval_rejected",
  "advertising.action_command_created",
  "advertising.action_command_executed",
  "advertising.action_command_failed",
  "advertising.sync_started",
  "advertising.sync_completed",
  "advertising.sync_failed",
  "advertising.proposal_created",
  "advertising.proposal_rejected_by_policy",
] as const;

export type AdvertisingAuditAction = (typeof ADVERTISING_AUDIT_ACTIONS)[number];

export const ADVERTISING_AUDIT_ENTITY_TYPES = [
  "ad_connection",
  "ad_account",
  "growth_campaign",
  "attribution_touchpoint",
  "conversion_event",
  "advertising_approval",
  "action_command",
  "copilot_proposal",
  "metric_snapshot",
] as const;

export type AdvertisingAuditEntityType = (typeof ADVERTISING_AUDIT_ENTITY_TYPES)[number];

export function isAdvertisingAuditAction(action: string): action is AdvertisingAuditAction {
  return (ADVERTISING_AUDIT_ACTIONS as readonly string[]).includes(action);
}
