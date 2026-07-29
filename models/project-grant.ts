import mongoose, { type InferSchemaType, Schema } from "mongoose";

import { PROJECT_ROLE_KEYS } from "@/lib/project-sharing-roles";

const PROJECT_GRANT_STATUSES = ["active", "suspended", "removed"] as const;

const projectGrantSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    projectRole: {
      type: String,
      enum: PROJECT_ROLE_KEYS,
      required: true,
    },
    status: {
      type: String,
      enum: PROJECT_GRANT_STATUSES,
      required: true,
      default: "active",
    },
    grantedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    revokedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

projectGrantSchema.index({ workspaceId: 1, projectId: 1, userId: 1 }, { unique: true });
projectGrantSchema.index({ workspaceId: 1, userId: 1, status: 1 });
projectGrantSchema.index({ workspaceId: 1, projectId: 1, status: 1 });
projectGrantSchema.index({ userId: 1, status: 1 });

export type ProjectGrantDocument = InferSchemaType<typeof projectGrantSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ProjectGrantModel =
  (mongoose.models.ProjectGrant as mongoose.Model<ProjectGrantDocument>) ??
  mongoose.model<ProjectGrantDocument>("ProjectGrant", projectGrantSchema);
