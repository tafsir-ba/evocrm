import "server-only";

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";

/** Signed GET URL TTL — 10 minutes */
export const SIGNED_DOWNLOAD_URL_TTL_SECONDS = 600;

/** Signed PUT URL TTL — 15 minutes */
export const SIGNED_UPLOAD_URL_TTL_SECONDS = 900;

export type SpacesConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function getSpacesConfig(): SpacesConfig {
  const env = getEnv();

  const endpoint = env.DIGITALOCEAN_SPACES_ENDPOINT;
  const region = env.DIGITALOCEAN_SPACES_REGION;
  const bucket = env.DIGITALOCEAN_SPACES_BUCKET;
  const accessKeyId = env.DIGITALOCEAN_SPACES_KEY;
  const secretAccessKey = env.DIGITALOCEAN_SPACES_SECRET;

  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new AppError(
      "INTERNAL_ERROR",
      "File storage is not configured. Contact your administrator.",
      { expose: true },
    );
  }

  return { endpoint, region, bucket, accessKeyId, secretAccessKey };
}

export function isSpacesConfigured(): boolean {
  const env = getEnv();
  return Boolean(
    env.DIGITALOCEAN_SPACES_ENDPOINT &&
      env.DIGITALOCEAN_SPACES_REGION &&
      env.DIGITALOCEAN_SPACES_BUCKET &&
      env.DIGITALOCEAN_SPACES_KEY &&
      env.DIGITALOCEAN_SPACES_SECRET,
  );
}

function createS3Client(config: SpacesConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: false,
  });
}

export async function generateUploadSignedUrl(input: {
  storageKey: string;
  mimeType: string;
  fileSize: number;
}): Promise<{ url: string; expiresAt: Date }> {
  const config = getSpacesConfig();
  const client = createS3Client(config);

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.storageKey,
    ContentType: input.mimeType,
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: SIGNED_UPLOAD_URL_TTL_SECONDS,
  });

  return {
    url,
    expiresAt: new Date(Date.now() + SIGNED_UPLOAD_URL_TTL_SECONDS * 1000),
  };
}

export async function generateDownloadSignedUrl(input: {
  storageKey: string;
  fileName: string;
}): Promise<{ url: string; expiresAt: Date }> {
  const config = getSpacesConfig();
  const client = createS3Client(config);

  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const getCommand = new GetObjectCommand({
    Bucket: config.bucket,
    Key: input.storageKey,
    ResponseContentDisposition: `inline; filename="${encodeURIComponent(input.fileName)}"`,
  });

  const url = await getSignedUrl(client, getCommand, {
    expiresIn: SIGNED_DOWNLOAD_URL_TTL_SECONDS,
  });

  return {
    url,
    expiresAt: new Date(Date.now() + SIGNED_DOWNLOAD_URL_TTL_SECONDS * 1000),
  };
}

export async function verifyUploadedObject(
  storageKey: string,
  expectedFileSize: number,
): Promise<boolean> {
  const config = getSpacesConfig();
  const client = createS3Client(config);

  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: storageKey,
      }),
    );

    return response.ContentLength === expectedFileSize;
  } catch {
    return false;
  }
}

export async function uploadObject(input: {
  storageKey: string;
  body: Buffer | Uint8Array;
  mimeType: string;
}): Promise<void> {
  const config = getSpacesConfig();
  const client = createS3Client(config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.storageKey,
      Body: input.body,
      ContentType: input.mimeType,
    }),
  );
}

export async function getObjectBuffer(storageKey: string): Promise<{
  body: Buffer;
  contentType: string | undefined;
}> {
  const config = getSpacesConfig();
  const client = createS3Client(config);
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");

  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: storageKey,
    }),
  );

  if (!response.Body) {
    throw new Error("Object body missing.");
  }

  const bytes = await response.Body.transformToByteArray();

  return {
    body: Buffer.from(bytes),
    contentType: response.ContentType,
  };
}

export async function deleteObject(storageKey: string): Promise<void> {
  const config = getSpacesConfig();
  const client = createS3Client(config);

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: storageKey,
    }),
  );
}

export function getBucketName(): string {
  return getSpacesConfig().bucket;
}
