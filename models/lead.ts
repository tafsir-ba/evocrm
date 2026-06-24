import mongoose, { type InferSchemaType, Schema } from "mongoose";

import {
  PROPERTY_TYPE_INTERESTS,
  TRANSACTION_INTENTS,
  USAGE_PURPOSES,
} from "@/lib/lead-preferences";

const EMAIL_CONSENT_STATUSES = ["unknown", "subscribed", "unsubscribed"] as const;

const leadSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    statusId: { type: Schema.Types.ObjectId, ref: "DictionaryItem", required: true },
    sourceId: { type: Schema.Types.ObjectId, ref: "DictionaryItem", default: null },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: null },
    emailNormalized: { type: String, trim: true, lowercase: true, default: null },
    phone: { type: String, trim: true, default: null },
    phoneNormalized: { type: String, trim: true, default: null },
    language: { type: String, trim: true, default: null },
    preferredContactMethod: { type: String, trim: true, default: null },
    budgetMin: { type: Number, default: null },
    budgetMax: { type: Number, default: null },
    preferredAreas: { type: [String], default: [] },
    propertyTypeInterests: {
      type: [{ type: String, enum: PROPERTY_TYPE_INTERESTS }],
      default: [],
    },
    transactionIntent: {
      type: String,
      enum: TRANSACTION_INTENTS,
      default: null,
    },
    usagePurpose: {
      type: String,
      enum: USAGE_PURPOSES,
      default: null,
    },
    notes: { type: String, trim: true, default: null },
    tags: { type: [{ type: Schema.Types.ObjectId, ref: "Tag" }], default: [] },
    attributes: { type: Schema.Types.Mixed, default: {} },
    emailConsentStatus: {
      type: String,
      enum: EMAIL_CONSENT_STATUSES,
      default: "unknown",
    },
    emailUnsubscribedAt: { type: Date, default: null },
    emailUnsubscribeReason: { type: String, trim: true, default: null },
    lastContactedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

leadSchema.index({ workspaceId: 1 });
leadSchema.index({ workspaceId: 1, projectId: 1 });
leadSchema.index({ workspaceId: 1, projectId: 1, archivedAt: 1 });
leadSchema.index({ workspaceId: 1, createdAt: -1 });
leadSchema.index({ workspaceId: 1, updatedAt: -1 });
leadSchema.index({ workspaceId: 1, archivedAt: 1 });
leadSchema.index({ workspaceId: 1, statusId: 1 });
leadSchema.index({ workspaceId: 1, sourceId: 1 });
leadSchema.index({ workspaceId: 1, assignedTo: 1 });
leadSchema.index({ workspaceId: 1, ownerId: 1 });
leadSchema.index({ workspaceId: 1, phoneNormalized: 1 });
leadSchema.index({ workspaceId: 1, fullName: 1 });
leadSchema.index({ workspaceId: 1, tags: 1 });
leadSchema.index({ workspaceId: 1, propertyTypeInterests: 1 });
leadSchema.index({ workspaceId: 1, transactionIntent: 1 });
leadSchema.index({ workspaceId: 1, usagePurpose: 1 });
leadSchema.index(
  { workspaceId: 1, emailNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: {
      emailNormalized: { $type: "string", $ne: "" },
      archivedAt: null,
    },
  },
);
leadSchema.index(
  {
    workspaceId: 1,
    "attributes.integration.integrationId": 1,
    "attributes.integration.idempotencyKey": 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      "attributes.integration.idempotencyKey": { $type: "string", $ne: "" },
      archivedAt: null,
    },
  },
);

export type LeadDocument = InferSchemaType<typeof leadSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const LeadModel =
  (mongoose.models.Lead as mongoose.Model<LeadDocument>) ??
  mongoose.model<LeadDocument>("Lead", leadSchema);
