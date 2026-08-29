import mongoose, { type InferSchemaType, Schema } from "mongoose";

export const HUBSPOT_PROJECT_MAPPING_STATUSES = [
  "unmapped",
  "mapped",
  "skipped",
] as const;

/**
 * Explicit HubSpot CRM project → Evohome project mapping.
 * No auto-create / no inferred destinations — reviewer must choose.
 */
const hubspotProjectMappingSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    integrationId: { type: Schema.Types.ObjectId, ref: "Integration", required: true },
    hubspotProjectId: { type: String, required: true, trim: true },
    hubspotProjectName: { type: String, required: true, trim: true },
    evoProjectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    status: {
      type: String,
      enum: HUBSPOT_PROJECT_MAPPING_STATUSES,
      required: true,
      default: "unmapped",
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

hubspotProjectMappingSchema.index({ workspaceId: 1, integrationId: 1 });
hubspotProjectMappingSchema.index(
  { workspaceId: 1, integrationId: 1, hubspotProjectId: 1 },
  { unique: true },
);
hubspotProjectMappingSchema.index({ workspaceId: 1, status: 1 });

export type HubSpotProjectMappingDocument = InferSchemaType<
  typeof hubspotProjectMappingSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const HubSpotProjectMappingModel =
  (mongoose.models.HubSpotProjectMapping as mongoose.Model<HubSpotProjectMappingDocument>) ??
  mongoose.model<HubSpotProjectMappingDocument>(
    "HubSpotProjectMapping",
    hubspotProjectMappingSchema,
  );
