import mongoose, { type InferSchemaType, Schema } from "mongoose";

const rateLimitBucketSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    count: { type: Number, required: true, default: 0 },
    resetAt: { type: Date, required: true },
  },
  { timestamps: false },
);

rateLimitBucketSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

export type RateLimitBucketDocument = InferSchemaType<typeof rateLimitBucketSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RateLimitBucketModel =
  (mongoose.models.RateLimitBucket as mongoose.Model<RateLimitBucketDocument>) ??
  mongoose.model<RateLimitBucketDocument>("RateLimitBucket", rateLimitBucketSchema);
