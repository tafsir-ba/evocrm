import mongoose, { type InferSchemaType, Schema } from "mongoose";

const SEGMENT_TYPES = ["project_tags"] as const;
const TAG_MATCH_MODES = ["any", "all"] as const;

const newsletterAudienceSegmentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true },
    type: {
      type: String,
      enum: SEGMENT_TYPES,
      required: true,
      default: "project_tags",
    },
    order: { type: Number, required: true, default: 1 },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    tagIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
      default: [],
    },
    tagMatch: {
      type: String,
      enum: TAG_MATCH_MODES,
      default: "any",
    },
  },
  { timestamps: true },
);

newsletterAudienceSegmentSchema.index({ workspaceId: 1, campaignId: 1 });
newsletterAudienceSegmentSchema.index({ workspaceId: 1, campaignId: 1, order: 1 });

export type NewsletterAudienceSegmentDocument = InferSchemaType<
  typeof newsletterAudienceSegmentSchema
> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const NewsletterAudienceSegmentModel =
  (mongoose.models.NewsletterAudienceSegment as mongoose.Model<NewsletterAudienceSegmentDocument>) ??
  mongoose.model<NewsletterAudienceSegmentDocument>(
    "NewsletterAudienceSegment",
    newsletterAudienceSegmentSchema,
  );
