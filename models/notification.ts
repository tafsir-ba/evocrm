import mongoose, { type InferSchemaType, Schema } from "mongoose";

export const NOTIFICATION_TYPES = ["feedback.resolved"] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: "", trim: true, maxlength: 1000 },
    href: { type: String, default: null, trim: true, maxlength: 2048 },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
    },
    entityType: { type: String, default: null, trim: true, maxlength: 64 },
    entityId: { type: String, default: null, trim: true, maxlength: 64 },
    readAt: { type: Date, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export type NotificationDocument = InferSchemaType<typeof notificationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const NotificationModel =
  (mongoose.models.Notification as mongoose.Model<NotificationDocument>) ??
  mongoose.model<NotificationDocument>("Notification", notificationSchema);
