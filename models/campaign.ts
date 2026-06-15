import mongoose, { type InferSchemaType, Schema } from "mongoose";

const CAMPAIGN_STATUSES = ["draft", "active", "paused", "archived"] as const;
const CAMPAIGN_AUDIENCE_TYPES = ["leads", "opportunities"] as const;
const ENROLLMENT_TRIGGERS = ["new_lead", "lead_updated", "manual_only"] as const;
const ENROLLMENT_LOGIC = ["AND", "OR"] as const;
const ENROLLMENT_CONDITION_FIELDS = [
  "projectId",
  "tags",
  "sourceId",
  "statusId",
  "assignedTo",
  "customField",
] as const;
const ENROLLMENT_CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "is_empty",
  "is_not_empty",
] as const;

const enrollmentConditionSchema = new Schema(
  {
    field: { type: String, enum: ENROLLMENT_CONDITION_FIELDS, required: true },
    operator: { type: String, enum: ENROLLMENT_CONDITION_OPERATORS, required: true },
    value: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const enrollmentRulesSchema = new Schema(
  {
    logic: { type: String, enum: ENROLLMENT_LOGIC, default: "AND" },
    conditions: { type: [enrollmentConditionSchema], default: [] },
  },
  { _id: false },
);

const campaignSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: CAMPAIGN_STATUSES,
      default: "draft",
    },
    audienceType: {
      type: String,
      enum: CAMPAIGN_AUDIENCE_TYPES,
      required: true,
    },
    projectIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Project" }],
      default: [],
    },
    autoEnrollmentEnabled: { type: Boolean, default: false },
    enrollmentTrigger: {
      type: String,
      enum: ENROLLMENT_TRIGGERS,
      default: "manual_only",
    },
    enrollmentRules: {
      type: enrollmentRulesSchema,
      default: () => ({ logic: "AND", conditions: [] }),
    },
    frequency: { type: String, trim: true, default: null },
    defaultFromName: { type: String, trim: true, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

campaignSchema.index({ workspaceId: 1 });
campaignSchema.index({ workspaceId: 1, projectIds: 1 });
campaignSchema.index({ workspaceId: 1, autoEnrollmentEnabled: 1, enrollmentTrigger: 1 });
campaignSchema.index({ workspaceId: 1, status: 1 });
campaignSchema.index({ workspaceId: 1, audienceType: 1 });
campaignSchema.index({ workspaceId: 1, createdAt: -1 });
campaignSchema.index({ workspaceId: 1, archivedAt: 1 });
campaignSchema.index({ workspaceId: 1, ownerId: 1 });

export type CampaignDocument = InferSchemaType<typeof campaignSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CampaignModel =
  (mongoose.models.Campaign as mongoose.Model<CampaignDocument>) ??
  mongoose.model<CampaignDocument>("Campaign", campaignSchema);
