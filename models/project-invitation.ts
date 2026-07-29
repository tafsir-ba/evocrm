import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { PROJECT_ROLE_KEYS } from "@/server/permissions/project-roles";

const INVITATION_STATUSES = ["pending", "accepted", "expired", "revoked"] as const;

const projectInvitationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    projectRole: {
      type: String,
      enum: PROJECT_ROLE_KEYS,
      required: true,
    },
    status: {
      type: String,
      enum: INVITATION_STATUSES,
      required: true,
      default: "pending",
    },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    acceptedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    acceptedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    revokedAt: { type: Date, default: null },
    lastResentAt: { type: Date, default: null },
    message: { type: String, trim: true, default: null, maxlength: 500 },
  },
  { timestamps: true },
);

projectInvitationSchema.index({ workspaceId: 1, projectId: 1, email: 1 });
projectInvitationSchema.index({ tokenHash: 1 }, { unique: true });
projectInvitationSchema.index({ expiresAt: 1 });
projectInvitationSchema.index({ workspaceId: 1, projectId: 1, status: 1 });

export type ProjectInvitationDocument = InferSchemaType<typeof projectInvitationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ProjectInvitationModel =
  (mongoose.models.ProjectInvitation as mongoose.Model<ProjectInvitationDocument>) ??
  mongoose.model<ProjectInvitationDocument>("ProjectInvitation", projectInvitationSchema);
