import type { CampaignStepRecord } from "@/server/repositories/campaign-steps";
import type { CampaignRecord } from "@/server/repositories/campaigns";
import type { CampaignEnrollmentRecord } from "@/server/repositories/campaign-enrollments";
import type { CampaignSendRecord } from "@/server/repositories/campaign-sends";
import type { LeadRecord } from "@/server/repositories/leads";
import type { ProjectRecord } from "@/server/repositories/projects";

export const TEST_PROJECT_ID = "507f1f77bcf86cd799439011";

export const projectRecordExtras: Pick<
  ProjectRecord,
  "projectType" | "defaultDripCampaignId"
> = {
  projectType: null,
  defaultDripCampaignId: null,
};

export const campaignRecordExtras: Pick<
  CampaignRecord,
  | "projectIds"
  | "autoEnrollmentEnabled"
  | "enrollmentTrigger"
  | "enrollmentRules"
  | "senderName"
  | "senderEmail"
  | "sendingDomainId"
> = {
  projectIds: [],
  autoEnrollmentEnabled: false,
  enrollmentTrigger: "manual_only",
  enrollmentRules: { logic: "AND", conditions: [] },
  senderName: null,
  senderEmail: null,
  sendingDomainId: null,
};

export const enrollmentRecordExtras: Pick<
  CampaignEnrollmentRecord,
  "projectId" | "enrollmentSource" | "enrollmentReason" | "sendClaimExpiresAt"
> = {
  projectId: null,
  enrollmentSource: "manual",
  enrollmentReason: null,
  sendClaimExpiresAt: null,
};

export const campaignSendRecordExtras: Pick<
  CampaignSendRecord,
  | "deliveredAt"
  | "firstOpenedAt"
  | "firstClickedAt"
  | "bouncedAt"
  | "complainedAt"
  | "deliveryDelayedAt"
  | "providerFailedAt"
  | "providerError"
  | "lastProviderEventAt"
> = {
  deliveredAt: null,
  firstOpenedAt: null,
  firstClickedAt: null,
  bouncedAt: null,
  complainedAt: null,
  deliveryDelayedAt: null,
  providerFailedAt: null,
  providerError: null,
  lastProviderEventAt: null,
};

export const campaignStepRecordExtras: Pick<
  CampaignStepRecord,
  | "name"
  | "delayAmount"
  | "delayUnit"
  | "status"
  | "contentMode"
  | "previewText"
  | "bodyHtml"
  | "bodyText"
> = {
  name: "Welcome email",
  delayAmount: 0,
  delayUnit: "days",
  status: "ready",
  contentMode: "plain_text",
  previewText: null,
  bodyHtml: null,
  bodyText: null,
};

export const leadRecordExtras = {
  projectId: TEST_PROJECT_ID,
};

export function buildTestLeadRecord(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: "lead-1",
    workspaceId: "ws-1",
    projectId: TEST_PROJECT_ID,
    statusId: "s1",
    sourceId: null,
    ownerId: null,
    assignedTo: null,
    firstName: "Jane",
    lastName: "Doe",
    fullName: "Jane Doe",
    email: "jane@example.com",
    emailNormalized: "jane@example.com",
    phone: null,
    phoneNormalized: null,
    language: null,
    preferredContactMethod: null,
    budgetMin: null,
    budgetMax: null,
    preferredAreas: [],
    propertyTypeInterests: [],
    transactionIntent: null,
    usagePurpose: null,
    notes: null,
    tags: [],
    attributes: {},
    emailConsentStatus: "subscribed",
    emailUnsubscribedAt: null,
    emailUnsubscribeReason: null,
    lastContactedAt: null,
    createdBy: "user-1",
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export const activityRecordExtras = {
  projectId: TEST_PROJECT_ID,
};

export const opportunityRecordExtras = {
  projectId: TEST_PROJECT_ID,
};
