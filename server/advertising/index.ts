import "server-only";

export {
  ADVERTISING_APPROVAL_STATES,
  ADVERTISING_APPROVAL_SUBJECTS,
  ADVERTISING_HUMAN_APPROVAL_REQUIRED,
  ADVERTISING_GUARDRAIL_AUTOMATABLE,
  requiresHumanApproval,
  type AdvertisingApprovalState,
  type AdvertisingApprovalSubject,
} from "@/server/advertising/approvals";

export {
  ADVERTISING_AUDIT_ACTIONS,
  ADVERTISING_AUDIT_ENTITY_TYPES,
  isAdvertisingAuditAction,
  type AdvertisingAuditAction,
  type AdvertisingAuditEntityType,
} from "@/server/advertising/audit-events";

export { ADVERTISING_DEFAULTS, type AdvertisingDefaults } from "@/server/advertising/defaults";

export {
  ADVERTISING_JOB_CONVENTIONS,
  ADVERTISING_JOB_KINDS,
  buildAdvertisingIdempotencyKey,
  classifySyncFreshness,
  type AdvertisingJobKind,
  type SyncFreshnessStatus,
} from "@/server/advertising/jobs/conventions";

export {
  AD_PLATFORMS,
  NullAdvertisingPlatformAdapter,
  assertNoPlatformNetworkInPhase0,
  type AdPlatform,
  type AdvertisingPlatformAdapter,
} from "@/server/advertising/platforms/adapter";

export {
  MetaAdvertisingPlatformAdapter,
  assertMetaReadOnlyCapabilities,
} from "@/server/advertising/platforms/meta/adapter";

export {
  assertGrowthCampaignProjectId,
  assertProjectReassignAllowed,
  resolveTrustedDestinationProjectId,
} from "@/server/advertising/routing/project-invariant";

export {
  CONSENT_CAPTURE_CHANNELS,
  CONSENT_PURPOSES,
  canExportConversion,
  canExportCustomerMatch,
  consentStateFromCookieConsent,
  emptyConsentState,
  type ConsentCaptureChannel,
  type ConsentPurpose,
  type ConsentState,
} from "@/server/advertising/attribution/consent";
