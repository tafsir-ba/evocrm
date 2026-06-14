import "server-only";

import { randomUUID } from "node:crypto";

import { AppError } from "@/server/errors";
import { sanitizeFileName } from "@/server/services/document-file-utils";

export function buildFeedbackStorageKey(input: {
  feedbackId: string;
  fileName: string;
}): string {
  const safeName = sanitizeFileName(input.fileName);
  const uniqueId = randomUUID();

  return `feedback/${input.feedbackId}/${uniqueId}/${safeName}`;
}

export function assertFeedbackStorageKey(storageKey: string): void {
  if (!storageKey.startsWith("feedback/")) {
    throw new AppError("VALIDATION_ERROR", "Invalid feedback storage key.");
  }
}
