import mongoose, { type InferSchemaType, Schema } from "mongoose";

const SUPPRESSION_REASONS = [
  "unsubscribed",
  "hard_bounce",
  "complaint",
  "manual",
] as const;

const SUPPRESSION_SOURCES = [
  "campaign_unsubscribe",
  "webhook",
  "manual",
  "import",
] as const;

const emailSuppressionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    contactId: { type: Schema.Types.ObjectId, default: null },
    email: { type: String, required: true, trim: true, lowercase: true },
    reason: { type: String, enum: SUPPRESSION_REASONS, required: true },
    source: { type: String, enum: SUPPRESSION_SOURCES, required: true },
    notes: { type: String, trim: true, default: null },
  },
  { timestamps: true },
);

emailSuppressionSchema.index({ workspaceId: 1, email: 1 }, { unique: true });
emailSuppressionSchema.index({ workspaceId: 1, contactId: 1 });

export type EmailSuppressionDocument = InferSchemaType<typeof emailSuppressionSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const EmailSuppressionModel =
  (mongoose.models.EmailSuppression as mongoose.Model<EmailSuppressionDocument>) ??
  mongoose.model<EmailSuppressionDocument>("EmailSuppression", emailSuppressionSchema);
