import mongoose, { type InferSchemaType, Schema } from "mongoose";

const suggestionSchema = new Schema(
  {
    id: { type: String, required: true },
    fieldKey: { type: String, required: true },
    proposedValue: { type: String, required: true },
    currentValue: { type: String, default: null },
    currentOrigin: { type: String, default: null },
    confidencePercent: { type: Number, required: true },
    rationale: { type: String, default: "" },
    sourceUrls: { type: [String], default: [] },
    retrievedAt: { type: String, required: true },
    searchProvider: { type: String, required: true },
    aiModel: { type: String, required: true },
    status: { type: String, required: true, default: "proposed" },
    acceptedValue: { type: String, default: null },
    previousValue: { type: String, default: null },
    previousProvenance: { type: Schema.Types.Mixed, default: null },
    overwriteAcknowledged: { type: Boolean, default: false },
    decidedBy: { type: String, default: null },
    decidedAt: { type: String, default: null },
  },
  { _id: false },
);

const leadEnrichmentRunSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    initiatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, required: true, default: "searching" },
    queryFullName: { type: String, required: true },
    queryEmail: { type: String, required: true },
    allowedSources: { type: [String], default: [] },
    searchProvider: { type: String, default: null },
    aiModel: { type: String, default: null },
    retrievedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    identityMatch: { type: String, default: null },
    identityRationale: { type: String, default: null },
    failureMessage: { type: String, default: null },
    demoMode: { type: Boolean, default: false },
    sources: { type: Schema.Types.Mixed, default: [] },
    suggestions: { type: [suggestionSchema], default: [] },
    summaryDraft: { type: Schema.Types.Mixed, default: null },
    acceptedSummary: { type: Schema.Types.Mixed, default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

leadEnrichmentRunSchema.index({ workspaceId: 1, leadId: 1, createdAt: -1 });
leadEnrichmentRunSchema.index({ workspaceId: 1, expiresAt: 1 });

export type LeadEnrichmentRunDocument = InferSchemaType<typeof leadEnrichmentRunSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const LeadEnrichmentRunModel =
  (mongoose.models.LeadEnrichmentRun as mongoose.Model<LeadEnrichmentRunDocument>) ??
  mongoose.model<LeadEnrichmentRunDocument>("LeadEnrichmentRun", leadEnrichmentRunSchema);
