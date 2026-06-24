import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { RateLimitBucketModel } from "@/models/rate-limit-bucket";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: number }).code === 11000
  );
}

export async function incrementMongoWebsiteLeadRateLimitBucket(
  key: string,
  windowMs: number,
): Promise<{ count: number; resetAt: number }> {
  await connectDb();

  const now = Date.now();
  const resetAt = now + windowMs;

  const resetBucket = await RateLimitBucketModel.findOneAndUpdate(
    { key, resetAt: { $lte: new Date(now) } },
    { $set: { count: 1, resetAt: new Date(resetAt) } },
    { new: true },
  ).lean();

  if (resetBucket) {
    return { count: resetBucket.count, resetAt: resetBucket.resetAt.getTime() };
  }

  const incrementedBucket = await RateLimitBucketModel.findOneAndUpdate(
    { key, resetAt: { $gt: new Date(now) } },
    { $inc: { count: 1 } },
    { new: true },
  ).lean();

  if (incrementedBucket) {
    return {
      count: incrementedBucket.count,
      resetAt: incrementedBucket.resetAt.getTime(),
    };
  }

  try {
    const createdBucket = await RateLimitBucketModel.create({
      key,
      count: 1,
      resetAt: new Date(resetAt),
    });

    return {
      count: createdBucket.count,
      resetAt: createdBucket.resetAt.getTime(),
    };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return incrementMongoWebsiteLeadRateLimitBucket(key, windowMs);
    }

    throw error;
  }
}
