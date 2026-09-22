import "server-only";

import { z } from "zod";

import {
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_VISIT_DOCUMENT_FILE_SIZE_BYTES,
} from "@/lib/documents";
import {
  VISIT_AUDIO_MIME_TYPES,
  VISIT_VIDEO_MIME_TYPES,
} from "@/lib/visit-notes";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

export const DOCUMENT_LINKED_ENTITY_TYPES = [
  "lead",
  "property",
  "opportunity",
  "campaign",
  "visit_session",
] as const;

export type DocumentLinkedEntityType = (typeof DOCUMENT_LINKED_ENTITY_TYPES)[number];

export const DOCUMENT_VISIBILITY_VALUES = ["private", "workspace"] as const;

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  ...VISIT_AUDIO_MIME_TYPES,
  ...VISIT_VIDEO_MIME_TYPES,
] as const;

export { MAX_DOCUMENT_FILE_SIZE_BYTES, MAX_VISIT_DOCUMENT_FILE_SIZE_BYTES };

const documentMimeTypePrefixSchema = z.literal("image/");

export const DOCUMENT_LIST_SORT_ORDERS = ["asc", "desc"] as const;

export type DocumentListSortOrder = (typeof DOCUMENT_LIST_SORT_ORDERS)[number];

export const documentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  linkedEntityType: z.enum(DOCUMENT_LINKED_ENTITY_TYPES),
  linkedEntityId: objectIdSchema,
  mimeTypePrefix: documentMimeTypePrefixSchema.optional(),
  sortOrder: z.enum(DOCUMENT_LIST_SORT_ORDERS).optional(),
});

const baseUploadFields = {
  linkedEntityType: z.enum(DOCUMENT_LINKED_ENTITY_TYPES),
  linkedEntityId: objectIdSchema,
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  visibility: z.enum(DOCUMENT_VISIBILITY_VALUES).default("private"),
  ownerId: objectIdSchema.optional(),
};

function maxBytesForLinkedEntity(
  linkedEntityType: DocumentLinkedEntityType,
): number {
  return linkedEntityType === "visit_session"
    ? MAX_VISIT_DOCUMENT_FILE_SIZE_BYTES
    : MAX_DOCUMENT_FILE_SIZE_BYTES;
}

export const documentUploadUrlInputSchema = z
  .object({
    ...baseUploadFields,
    fileSize: z.coerce.number().int().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const max = maxBytesForLinkedEntity(value.linkedEntityType);
    if (value.fileSize > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `File exceeds maximum allowed size of ${max} bytes.`,
        path: ["fileSize"],
      });
    }
  });

export const documentConfirmInputSchema = z
  .object({
    uploadId: z.string().trim().min(1).max(2048),
    storageKey: z.string().trim().min(1).max(1024),
    ...baseUploadFields,
    fileSize: z.coerce.number().int().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const max = maxBytesForLinkedEntity(value.linkedEntityType);
    if (value.fileSize > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `File exceeds maximum allowed size of ${max} bytes.`,
        path: ["fileSize"],
      });
    }
  });

export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
export type DocumentUploadUrlInput = z.infer<typeof documentUploadUrlInputSchema>;
export type DocumentConfirmInput = z.infer<typeof documentConfirmInputSchema>;
