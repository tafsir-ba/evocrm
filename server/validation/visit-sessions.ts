import "server-only";

import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

export const visitSessionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  leadId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
});

export const createVisitSessionInputSchema = z
  .object({
    leadId: objectIdSchema,
    language: z.string().trim().min(2).max(16).optional().nullable(),
  })
  .strict();

export const updateVisitSessionInputSchema = z
  .object({
    language: z.string().trim().min(2).max(16).optional().nullable(),
    editedDraftBody: z.string().trim().max(20000).optional().nullable(),
    title: z.string().trim().min(1).max(120).optional().nullable(),
    propertyId: objectIdSchema.optional().nullable(),
  })
  .strict();

export const appendVisitMessageInputSchema = z
  .object({
    kind: z.enum(["text", "photo", "video", "audio", "system"]),
    text: z.string().trim().min(1).max(10000).optional().nullable(),
    documentId: objectIdSchema.optional().nullable(),
    language: z.string().trim().min(2).max(16).optional().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "text" || value.kind === "system") {
      if (!value.text?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Text is required for this message kind.",
          path: ["text"],
        });
      }
    }
    if (value.kind === "photo" || value.kind === "video" || value.kind === "audio") {
      if (!value.documentId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "documentId is required for media messages.",
          path: ["documentId"],
        });
      }
    }
  });

export const summarizeVisitSessionInputSchema = z
  .object({
    language: z.string().trim().min(2).max(16).optional().nullable(),
  })
  .strict();

export const publishVisitSessionInputSchema = z
  .object({
    editedDraftBody: z.string().trim().min(1).max(20000).optional().nullable(),
    createTasksFromNextSteps: z.boolean().optional().default(false),
    mirrorToLeadNotes: z.boolean().optional().default(false),
  })
  .strict();

export const transcribeVisitMessageInputSchema = z
  .object({
    messageId: z.string().trim().min(1).max(64),
    language: z.string().trim().min(2).max(16).optional().nullable(),
  })
  .strict();

export type VisitSessionListQuery = z.infer<typeof visitSessionListQuerySchema>;
export type CreateVisitSessionInput = z.infer<typeof createVisitSessionInputSchema>;
export type UpdateVisitSessionInput = z.infer<typeof updateVisitSessionInputSchema>;
export type AppendVisitMessageInput = z.infer<typeof appendVisitMessageInputSchema>;
export type SummarizeVisitSessionInput = z.infer<typeof summarizeVisitSessionInputSchema>;
export type PublishVisitSessionInput = z.infer<typeof publishVisitSessionInputSchema>;
export type TranscribeVisitMessageInput = z.infer<typeof transcribeVisitMessageInputSchema>;
