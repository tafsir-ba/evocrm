import "server-only";

import { Readable } from "stream";

import mongoose from "mongoose";

import { connectDb } from "@/server/db/mongoose";
import { AppError } from "@/server/errors";
import {
  getObjectBuffer,
  isSpacesConfigured,
  uploadObject,
} from "@/server/storage/spaces";

const GRIDFS_BUCKET = "import_files";

export type ImportFileStorageProvider = "spaces" | "gridfs";

export function buildImportStorageKey(
  workspaceId: string,
  importJobId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `imports/${workspaceId}/${importJobId}/${safeName}`;
}

export async function saveImportFileBuffer(input: {
  workspaceId: string;
  importJobId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ storageKey: string; storageProvider: ImportFileStorageProvider }> {
  if (isSpacesConfigured()) {
    const storageKey = buildImportStorageKey(
      input.workspaceId,
      input.importJobId,
      input.fileName,
    );

    await uploadObject({
      storageKey,
      body: input.buffer,
      mimeType: input.mimeType,
    });

    return { storageKey, storageProvider: "spaces" };
  }

  const storageKey = `gridfs:${input.workspaceId}:${input.importJobId}`;
  await saveToGridFs(storageKey, input.buffer, input.mimeType);

  return { storageKey, storageProvider: "gridfs" };
}

export async function loadImportFileBuffer(input: {
  storageKey: string;
  storageProvider: ImportFileStorageProvider;
}): Promise<Buffer> {
  if (input.storageProvider === "spaces") {
    const object = await getObjectBuffer(input.storageKey);
    return object.body;
  }

  return loadFromGridFs(input.storageKey);
}

async function saveToGridFs(
  storageKey: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  await connectDb();
  const db = mongoose.connection.db;

  if (!db) {
    throw new AppError("INTERNAL_ERROR", "Database connection is unavailable.");
  }

  const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: GRIDFS_BUCKET });

  await deleteFromGridFs(storageKey).catch(() => undefined);

  await new Promise<void>((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(storageKey, {
      contentType: mimeType,
    });

    Readable.from(buffer)
      .pipe(uploadStream)
      .on("finish", () => resolve())
      .on("error", reject);
  });
}

async function loadFromGridFs(storageKey: string): Promise<Buffer> {
  await connectDb();
  const db = mongoose.connection.db;

  if (!db) {
    throw new AppError("INTERNAL_ERROR", "Database connection is unavailable.");
  }

  const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: GRIDFS_BUCKET });
  const downloadStream = bucket.openDownloadStreamByName(storageKey);
  const chunks: Buffer[] = [];

  return new Promise<Buffer>((resolve, reject) => {
    downloadStream
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", () => resolve(Buffer.concat(chunks)))
      .on("error", reject);
  });
}

async function deleteFromGridFs(storageKey: string): Promise<void> {
  await connectDb();
  const db = mongoose.connection.db;

  if (!db) {
    return;
  }

  const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: GRIDFS_BUCKET });
  const files = await bucket.find({ filename: storageKey }).toArray();

  await Promise.all(
    files.map((file) => bucket.delete(file._id)),
  );
}
