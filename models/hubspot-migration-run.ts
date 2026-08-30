import mongoose, { type InferSchemaType, Schema } from "mongoose";

export const HUBSPOT_MIGRATION_RUN_STATUSES = [
  "running",
  "completed",
  "aborted",
  "failed",
] as const;

export const HUBSPOT_MIGRATION_RUN_MODES = ["dry-run", "execute"] as const;

export const HUBSPOT_MIGRATION_RECORD_OUTCOMES = [
  "would_create",
  "created",
  "skipped",
  "unexpected",
  "aborted_unprocessed",
] as const;

const hubspotMigrationRecordSchema = new Schema(
  {
    hubspotContactId: { type: String, required: true, trim: true },
    idempotencyKey: { type: String, required: true, trim: true },
    cohort: { type: String, required: true, trim: true },
    exclusions: { type: [String], default: [] },
    outcome: {
      type: String,
      enum: HUBSPOT_MIGRATION_RECORD_OUTCOMES,
      required: true,
    },
    unexpectedReason: { type: String, default: null, trim: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    destinationProjectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
  },
  { _id: false },
);

const hubspotMigrationRunSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    integrationId: { type: Schema.Types.ObjectId, ref: "Integration", required: true },
    portalId: { type: String, required: true, trim: true },
    destinationProjectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    destinationReference: { type: String, required: true, trim: true },
    manifestName: { type: String, required: true, trim: true },
    manifestChecksum: { type: String, required: true, trim: true },
    hubspotContactIds: { type: [String], required: true },
    mode: {
      type: String,
      enum: HUBSPOT_MIGRATION_RUN_MODES,
      required: true,
    },
    status: {
      type: String,
      enum: HUBSPOT_MIGRATION_RUN_STATUSES,
      required: true,
    },
    abortThreshold: { type: Number, required: true, default: 1 },
    unexpectedCount: { type: Number, required: true, default: 0 },
    createdCount: { type: Number, required: true, default: 0 },
    skippedCount: { type: Number, required: true, default: 0 },
    wouldCreateCount: { type: Number, required: true, default: 0 },
    aborted: { type: Boolean, required: true, default: false },
    abortReason: { type: String, default: null, trim: true },
    records: { type: [hubspotMigrationRecordSchema], default: [] },
    reconciliation: { type: Schema.Types.Mixed, default: {} },
    sideEffectGuard: { type: Schema.Types.Mixed, required: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, autoIndex: false },
);

hubspotMigrationRunSchema.index({ workspaceId: 1, createdAt: -1 });
hubspotMigrationRunSchema.index({ workspaceId: 1, manifestName: 1, createdAt: -1 });
hubspotMigrationRunSchema.index(
  { workspaceId: 1, manifestChecksum: 1, mode: 1 },
  { unique: true, partialFilterExpression: { mode: "execute", status: { $in: ["running", "completed"] } } },
);

export type HubSpotMigrationRunDocument = InferSchemaType<typeof hubspotMigrationRunSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const HubSpotMigrationRunModel =
  (mongoose.models.HubSpotMigrationRun as mongoose.Model<HubSpotMigrationRunDocument>) ??
  mongoose.model<HubSpotMigrationRunDocument>(
    "HubSpotMigrationRun",
    hubspotMigrationRunSchema,
  );
