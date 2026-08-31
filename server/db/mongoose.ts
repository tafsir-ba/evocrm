import "server-only";

import mongoose from "mongoose";

import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";

/**
 * Production must not auto-build schema indexes. Unique lead indexes
 * (emailNormalized, HubSpot idempotencyKey) currently collide with
 * duplicate migrated rows and can hang or crash the App Platform process.
 */
if (process.env.NODE_ENV === "production") {
  mongoose.set("autoIndex", false);
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __evocrmMongooseCache: MongooseCache | undefined;
}

const globalCache = globalThis as typeof globalThis & {
  __evocrmMongooseCache?: MongooseCache;
};

const cache: MongooseCache = globalCache.__evocrmMongooseCache ?? {
  conn: null,
  promise: null,
};

if (!globalCache.__evocrmMongooseCache) {
  globalCache.__evocrmMongooseCache = cache;
}

/**
 * Connect to MongoDB using validated MONGODB_URI.
 * Reuses a cached connection in development to avoid hot-reload duplicates.
 */
export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) {
    return cache.conn;
  }

  const env = getEnv();
  const { MONGODB_URI } = env;

  if (!cache.promise) {
    const disableAutoIndex = env.NODE_ENV === "production";
    if (disableAutoIndex) {
      mongoose.set("autoIndex", false);
    }

    cache.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
        autoIndex: !disableAutoIndex,
      })
      .then((connection) => connection)
      .catch((error: unknown) => {
        cache.promise = null;
        throw new AppError("INTERNAL_ERROR", "Database connection failed.", {
          expose: false,
          cause: error,
        });
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

/**
 * Reset connection cache — for tests only.
 */
export async function disconnectDbForTests(): Promise<void> {
  if (cache.conn) {
    await mongoose.disconnect();
  }
  cache.conn = null;
  cache.promise = null;
}
