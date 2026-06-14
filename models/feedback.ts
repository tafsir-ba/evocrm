import mongoose, { type InferSchemaType, Schema } from "mongoose";

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
} from "@/server/feedback/constants";

const feedbackScreenshotSchema = new Schema(
  {
    storageKey: { type: String, required: true, trim: true },
    filename: { type: String, required: true, trim: true },
    sizeBytes: { type: Number, required: true, min: 1 },
    contentType: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const feedbackSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userEmail: { type: String, required: true, trim: true, lowercase: true },
    userName: { type: String, trim: true },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
    },
    category: {
      type: String,
      enum: FEEDBACK_CATEGORIES,
      required: true,
      default: "bug",
    },
    body: { type: String, default: "", trim: true, maxlength: 4000 },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    pageUrl: { type: String, default: null, trim: true, maxlength: 2048 },
    userAgent: { type: String, default: null, trim: true, maxlength: 512 },
    screenshots: { type: [feedbackScreenshotSchema], default: [] },
    status: {
      type: String,
      enum: FEEDBACK_STATUSES,
      required: true,
      default: "open",
    },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ userId: 1, createdAt: -1 });
feedbackSchema.index({ workspaceId: 1, createdAt: -1 });
feedbackSchema.index({ category: 1, createdAt: -1 });

export type FeedbackDocument = InferSchemaType<typeof feedbackSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FeedbackModel =
  (mongoose.models.Feedback as mongoose.Model<FeedbackDocument>) ??
  mongoose.model<FeedbackDocument>("Feedback", feedbackSchema);
