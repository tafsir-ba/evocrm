import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { LEAD_PROJECT_MEMBERSHIP_SOURCES } from "@/lib/lead-project-membership";

const provenanceSchema = new Schema(
  {
    method: { type: String, required: true, trim: true },
    source: { type: String, required: true, trim: true },
    appliedAt: { type: String, required: true, trim: true },
    notes: { type: String, trim: true, default: "" },
    hubspotContactId: { type: String, trim: true, default: undefined },
    hubspotAssociationId: { type: String, trim: true, default: undefined },
    sourceMembershipDate: { type: String, trim: true, default: undefined },
    sourceOrder: { type: Number, default: undefined },
  },
  { _id: false },
);

const leadProjectMembershipSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    isPrimary: { type: Boolean, required: true, default: false },
    joinedAt: { type: Date, required: true },
    sourceOrder: { type: Number, required: true, default: 0 },
    source: {
      type: String,
      enum: LEAD_PROJECT_MEMBERSHIP_SOURCES,
      required: true,
    },
    provenance: { type: provenanceSchema, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

leadProjectMembershipSchema.index(
  { workspaceId: 1, leadId: 1, projectId: 1 },
  {
    unique: true,
    partialFilterExpression: { archivedAt: null },
    name: "workspaceId_1_leadId_1_projectId_1_unique",
  },
);
leadProjectMembershipSchema.index(
  { workspaceId: 1, leadId: 1 },
  {
    unique: true,
    partialFilterExpression: { isPrimary: true, archivedAt: null },
    name: "workspaceId_1_leadId_1_primary_unique",
  },
);
leadProjectMembershipSchema.index({ workspaceId: 1, projectId: 1, archivedAt: 1 });
leadProjectMembershipSchema.index({ workspaceId: 1, leadId: 1, sourceOrder: 1 });
leadProjectMembershipSchema.index({ workspaceId: 1, leadId: 1, archivedAt: 1 });

export type LeadProjectMembershipDocument = InferSchemaType<
  typeof leadProjectMembershipSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const LeadProjectMembershipModel =
  (mongoose.models.LeadProjectMembership as mongoose.Model<LeadProjectMembershipDocument>) ??
  mongoose.model<LeadProjectMembershipDocument>(
    "LeadProjectMembership",
    leadProjectMembershipSchema,
  );
