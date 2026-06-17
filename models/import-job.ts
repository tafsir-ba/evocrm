import mongoose, { type InferSchemaType, Schema } from "mongoose";

import {
  IMPORT_ENTITY_TYPES,
  IMPORT_JOB_STATUSES,
  type ImportEntityType,
  type ImportJobStatus,
} from "@/lib/imports";

const importMappingSchema = new Schema(
  {
    sourceColumnIndex: { type: Number, required: true },
    targetField: { type: String, default: null },
  },
  { _id: false },
);

const importRowIssueSchema = new Schema(
  {
    rowNumber: { type: Number, required: true },
    field: { type: String, default: null },
    message: { type: String, required: true },
    severity: { type: String, enum: ["error", "warning"], required: true },
  },
  { _id: false },
);

const importRowResultSchema = new Schema(
  {
    rowNumber: { type: Number, required: true },
    status: {
      type: String,
      enum: ["valid", "created", "skipped", "failed"],
      required: true,
    },
    entityId: { type: String, default: null },
    errors: { type: [importRowIssueSchema], default: [] },
    warnings: { type: [importRowIssueSchema], default: [] },
  },
  { _id: false },
);

const importJobSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    entityType: {
      type: String,
      enum: IMPORT_ENTITY_TYPES,
      required: true,
    },
    status: {
      type: String,
      enum: IMPORT_JOB_STATUSES,
      default: "draft",
    },
    fileName: { type: String, required: true, trim: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true, trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fileData: { type: Buffer, required: true },
    sheetName: { type: String, default: null },
    headerRowIndex: { type: Number, default: 0 },
    hasHeaderRow: { type: Boolean, default: true },
    detectedColumns: { type: [String], default: [] },
    previewRows: { type: [[String]], default: [] },
    mappings: { type: [importMappingSchema], default: [] },
    defaults: { type: Schema.Types.Mixed, default: {} },
    totalRows: { type: Number, default: 0 },
    validRows: { type: Number, default: 0 },
    warningRows: { type: Number, default: 0 },
    errorRows: { type: Number, default: 0 },
    validationIssues: { type: [importRowIssueSchema], default: [] },
    rowResults: { type: [importRowResultSchema], default: [] },
    createdCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true },
);

importJobSchema.index({ workspaceId: 1, createdAt: -1 });
importJobSchema.index({ workspaceId: 1, entityType: 1, status: 1 });

export type ImportJobDocument = InferSchemaType<typeof importJobSchema> & {
  _id: mongoose.Types.ObjectId;
  entityType: ImportEntityType;
  status: ImportJobStatus;
};

export const ImportJobModel =
  (mongoose.models.ImportJob as mongoose.Model<ImportJobDocument>) ??
  mongoose.model<ImportJobDocument>("ImportJob", importJobSchema);
