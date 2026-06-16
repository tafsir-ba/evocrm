import type { CampaignStepRecord } from "@/server/repositories/campaign-steps";
import type { CampaignRecord } from "@/server/repositories/campaigns";
import type { CampaignEnrollmentRecord } from "@/server/repositories/campaign-enrollments";
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
  "projectId" | "enrollmentSource" | "enrollmentReason"
> = {
  projectId: null,
  enrollmentSource: "manual",
  enrollmentReason: null,
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

export const activityRecordExtras = {
  projectId: TEST_PROJECT_ID,
};

export const opportunityRecordExtras = {
  projectId: TEST_PROJECT_ID,
};
