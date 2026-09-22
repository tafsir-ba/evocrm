import mongoose, { type InferSchemaType, Schema } from "mongoose";

export const VISIT_SESSION_STATUSES = [
  "open",
  "draft",
  "published",
  "amended",
  "archived",
] as const;

export type VisitSessionStatus = (typeof VISIT_SESSION_STATUSES)[number];

export const VISIT_MESSAGE_KINDS = [
  "text",
  "transcript",
  "photo",
  "video",
  "audio",
  "system",
] as const;

export type VisitMessageKind = (typeof VISIT_MESSAGE_KINDS)[number];

export const VISIT_MESSAGE_STATUSES = [
  "pending",
  "uploading",
  "transcribing",
  "ready",
  "failed",
] as const;

export type VisitMessageStatus = (typeof VISIT_MESSAGE_STATUSES)[number];

const visitNextStepSchema = new Schema(
  {
    text: { type: String, required: true, trim: true },
    ownerName: { type: String, trim: true, default: null },
    dueDate: { type: Date, default: null },
    needsConfirmation: { type: Boolean, default: false },
  },
  { _id: false },
);

const visitAiDraftSchema = new Schema(
  {
    version: { type: Number, required: true, min: 1 },
    summary: { type: String, trim: true, default: "" },
    customerRequirements: { type: String, trim: true, default: "" },
    propertyDiscussed: { type: String, trim: true, default: "" },
    questionsObjections: { type: String, trim: true, default: "" },
    actions: { type: String, trim: true, default: "" },
    nextSteps: { type: [visitNextStepSchema], default: [] },
    needsConfirmation: { type: [{ type: String, trim: true }], default: [] },
    language: { type: String, trim: true, default: "en" },
    sourceMessageIds: { type: [{ type: String, trim: true }], default: [] },
    editedBody: { type: String, trim: true, default: null },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

const visitMessageSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    kind: { type: String, enum: VISIT_MESSAGE_KINDS, required: true },
    text: { type: String, trim: true, default: null },
    documentId: { type: Schema.Types.ObjectId, ref: "Document", default: null },
    language: { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: VISIT_MESSAGE_STATUSES,
      default: "ready",
    },
    error: { type: String, trim: true, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

const visitSessionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    activityId: { type: Schema.Types.ObjectId, ref: "Activity", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, trim: true, default: null, maxlength: 120 },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", default: null },
    status: {
      type: String,
      enum: VISIT_SESSION_STATUSES,
      default: "open",
    },
    language: { type: String, trim: true, default: null },
    messages: { type: [visitMessageSchema], default: [] },
    documentIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Document" }],
      default: [],
    },
    aiDraft: { type: visitAiDraftSchema, default: null },
    draftHistory: { type: [visitAiDraftSchema], default: [] },
    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

visitSessionSchema.index({ workspaceId: 1, leadId: 1, createdAt: -1 });
visitSessionSchema.index({ workspaceId: 1, projectId: 1, archivedAt: 1 });
visitSessionSchema.index({ workspaceId: 1, createdBy: 1, createdAt: -1 });
visitSessionSchema.index({ workspaceId: 1, activityId: 1 });
visitSessionSchema.index({ workspaceId: 1, status: 1, archivedAt: 1 });

export type VisitSessionDocument = InferSchemaType<typeof visitSessionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const VisitSessionModel =
  (mongoose.models.VisitSession as mongoose.Model<VisitSessionDocument>) ??
  mongoose.model<VisitSessionDocument>("VisitSession", visitSessionSchema);
