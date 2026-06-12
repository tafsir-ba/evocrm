import mongoose, { type InferSchemaType, Schema } from "mongoose";

const membershipStatuses = ["active", "invited", "suspended", "removed"] as const;

const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true },
    status: {
      type: String,
      enum: membershipStatuses,
      required: true,
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User" },
    joinedAt: { type: Date },
  },
  { timestamps: true },
);

membershipSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });

export type MembershipDocument = InferSchemaType<typeof membershipSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const MembershipModel =
  (mongoose.models.Membership as mongoose.Model<MembershipDocument>) ??
  mongoose.model<MembershipDocument>("Membership", membershipSchema);
