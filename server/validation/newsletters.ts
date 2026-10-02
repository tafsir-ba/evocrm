import "server-only";

import { z } from "zod";

import { objectIdSchema } from "@/server/validation/campaigns";

export const NEWSLETTER_AUDIENCE_SEGMENT_MAX = 10;

const projectTagsSegmentSchema = z
  .object({
    type: z.literal("project_tags"),
    order: z.number().int().min(1).optional(),
    projectId: objectIdSchema,
    tagIds: z.array(objectIdSchema).max(50).default([]),
    tagMatch: z.enum(["any", "all"]).default("any"),
  })
  .strict();

const csvImportSegmentSchema = z
  .object({
    type: z.literal("csv_import"),
    order: z.number().int().min(1).optional(),
    projectId: objectIdSchema,
    importJobId: objectIdSchema,
    applyTagId: objectIdSchema.nullable().optional(),
  })
  .strict();

export const newsletterAudienceSegmentSchema = z.discriminatedUnion("type", [
  projectTagsSegmentSchema,
  csvImportSegmentSchema,
]);

export const newsletterAudienceSegmentsInputSchema = z
  .object({
    segments: z
      .array(newsletterAudienceSegmentSchema)
      .min(1)
      .max(NEWSLETTER_AUDIENCE_SEGMENT_MAX),
  })
  .strict();

export const newsletterScheduleInputSchema = z
  .object({
    scheduledForLocal: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
        "scheduledForLocal must be a datetime-local value (YYYY-MM-DDTHH:mm).",
      ),
  })
  .strict();

export const newsletterAudienceImportInputSchema = z
  .object({
    targetProjectId: objectIdSchema,
    applyTagId: objectIdSchema.optional(),
  })
  .strict();

export const newsletterAudiencePreviewQuerySchema = z.object({
  exclusionPage: z.coerce.number().int().min(1).default(1),
  exclusionPageSize: z.coerce.number().int().min(1).max(100).default(25),
  export: z.enum(["exclusions"]).optional(),
});

/** Raw body shape — address parsing/validation happens in the route for clear errors. */
export const newsletterTestSendInputSchema = z
  .object({
    emails: z.union([z.string(), z.array(z.string().trim().min(1).max(254))]),
  })
  .strict();

export type NewsletterAudienceSegmentsInput = z.infer<
  typeof newsletterAudienceSegmentsInputSchema
>;
export type NewsletterScheduleInput = z.infer<typeof newsletterScheduleInputSchema>;
export type NewsletterAudienceImportInput = z.infer<
  typeof newsletterAudienceImportInputSchema
>;
export type NewsletterAudiencePreviewQuery = z.infer<
  typeof newsletterAudiencePreviewQuerySchema
>;
export type NewsletterTestSendInput = z.infer<typeof newsletterTestSendInputSchema>;
