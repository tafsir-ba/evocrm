import mongoose, { type InferSchemaType, Schema } from "mongoose";

/**
 * Append-only lead status transitions.
 * One row per enter-status event (including the initial status on create).
 * Funnel stage-to-stage conversion uses distinct leadIds that ever reached a status.
 */
export const LEAD_STATUS_HISTORY_SOURCES = [
  "create",
  "manual",
  "automation",
  "import",
  "integration",
  "backfill_seed",
  "backfill_audit",
  "system",
] as const;

export type LeadStatusHistorySource =
  (typeof LEAD_STATUS_HISTORY_SOURCES)[number];

const leadStatusHistorySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    fromStatusId: {
      type: Schema.Types.ObjectId,
      ref: "DictionaryItem",
      default: null,
    },
    toStatusId: {
      type: Schema.Types.ObjectId,
      ref: "DictionaryItem",
      required: true,
    },
    changedAt: { type: Date, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    source: {
      type: String,
      enum: LEAD_STATUS_HISTORY_SOURCES,
      required: true,
    },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

leadStatusHistorySchema.index({ workspaceId: 1, leadId: 1, changedAt: 1 });
leadStatusHistorySchema.index({
  workspaceId: 1,
  projectId: 1,
  toStatusId: 1,
  changedAt: 1,
});
leadStatusHistorySchema.index({
  workspaceId: 1,
  leadId: 1,
  toStatusId: 1,
  changedAt: 1,
});
// Dedupe audit backfills: same lead/to/at/source should not double-insert.
leadStatusHistorySchema.index(
  {
    workspaceId: 1,
    leadId: 1,
    toStatusId: 1,
    changedAt: 1,
    source: 1,
  },
  { unique: true },
);

export type LeadStatusHistoryDocument = InferSchemaType<
  typeof leadStatusHistorySchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const LeadStatusHistoryModel =
  (mongoose.models.LeadStatusHistory as mongoose.Model<LeadStatusHistoryDocument>) ??
  mongoose.model<LeadStatusHistoryDocument>(
    "LeadStatusHistory",
    leadStatusHistorySchema,
  );
