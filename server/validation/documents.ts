import "server-only";

import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

export const DOCUMENT_LINKED_ENTITY_TYPES = ["lead", "property", "opportunity", "campaign"] as const;

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
] as const;

/** V1 max upload size — 25 MB */
export const MAX_DOCUMENT_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const documentMimeTypePrefixSchema = z.literal("image/");

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
});

export const documentUploadUrlInputSchema = z
  .object({
    linkedEntityType: z.enum(DOCUMENT_LINKED_ENTITY_TYPES),
    linkedEntityId: objectIdSchema,
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(120),
    fileSize: z.coerce.number().int().min(1).max(MAX_DOCUMENT_FILE_SIZE_BYTES),
    visibility: z.enum(DOCUMENT_VISIBILITY_VALUES).default("private"),
    ownerId: objectIdSchema.optional(),
  })
  .strict();

export const documentConfirmInputSchema = z
  .object({
    uploadId: z.string().trim().min(1).max(2048),
    storageKey: z.string().trim().min(1).max(1024),
    linkedEntityType: z.enum(DOCUMENT_LINKED_ENTITY_TYPES),
    linkedEntityId: objectIdSchema,
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(120),
    fileSize: z.coerce.number().int().min(1).max(MAX_DOCUMENT_FILE_SIZE_BYTES),
    visibility: z.enum(DOCUMENT_VISIBILITY_VALUES).default("private"),
    ownerId: objectIdSchema.optional(),
  })
  .strict();

export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
export type DocumentUploadUrlInput = z.infer<typeof documentUploadUrlInputSchema>;
export type DocumentConfirmInput = z.infer<typeof documentConfirmInputSchema>;
