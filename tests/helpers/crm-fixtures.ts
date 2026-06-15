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
> = {
  projectIds: [],
  autoEnrollmentEnabled: false,
  enrollmentTrigger: "manual_only",
  enrollmentRules: { logic: "AND", conditions: [] },
};

export const enrollmentRecordExtras: Pick<
  CampaignEnrollmentRecord,
  "projectId" | "enrollmentSource" | "enrollmentReason"
> = {
  projectId: null,
  enrollmentSource: "manual",
  enrollmentReason: null,
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
