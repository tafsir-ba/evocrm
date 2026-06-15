import mongoose, { type InferSchemaType, Schema } from "mongoose";

const ENROLLMENT_STATUSES = [
  "active",
  "paused",
  "completed",
  "unsubscribed",
  "failed",
] as const;

const ENROLLMENT_SOURCES = [
  "manual",
  "project_auto_enroll",
  "rule_based_auto_enrollment",
] as const;

const campaignEnrollmentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    enrollmentSource: {
      type: String,
      enum: ENROLLMENT_SOURCES,
      default: "manual",
    },
    enrollmentReason: { type: Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: ENROLLMENT_STATUSES,
      default: "active",
    },
    currentStep: { type: Number, required: true, min: 1 },
    nextSendAt: { type: Date, required: true },
    lastSentAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    unsubscribedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureReason: { type: String, trim: true, default: null },
  },
  { timestamps: true },
);

campaignEnrollmentSchema.index({ workspaceId: 1 });
campaignEnrollmentSchema.index({ workspaceId: 1, campaignId: 1 });
campaignEnrollmentSchema.index({ workspaceId: 1, campaignId: 1, status: 1 });
campaignEnrollmentSchema.index({ workspaceId: 1, leadId: 1 });
campaignEnrollmentSchema.index({ workspaceId: 1, opportunityId: 1 });
campaignEnrollmentSchema.index({ workspaceId: 1, nextSendAt: 1 });
campaignEnrollmentSchema.index({ workspaceId: 1, status: 1, nextSendAt: 1 });
campaignEnrollmentSchema.index({ workspaceId: 1, campaignId: 1, leadId: 1 });
campaignEnrollmentSchema.index({ workspaceId: 1, campaignId: 1, opportunityId: 1 });
campaignEnrollmentSchema.index({ workspaceId: 1, projectId: 1 });

export type CampaignEnrollmentDocument = InferSchemaType<
  typeof campaignEnrollmentSchema
> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CampaignEnrollmentModel =
  (mongoose.models.CampaignEnrollment as mongoose.Model<CampaignEnrollmentDocument>) ??
  mongoose.model<CampaignEnrollmentDocument>(
    "CampaignEnrollment",
    campaignEnrollmentSchema,
  );
