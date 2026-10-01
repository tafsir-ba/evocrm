import "server-only";

import { z } from "zod";

import { objectIdSchema } from "@/server/validation/campaigns";

export const newsletterAudienceSegmentSchema = z
  .object({
    type: z.literal("project_tags").default("project_tags"),
    order: z.number().int().min(1).optional(),
    projectId: objectIdSchema,
    tagIds: z.array(objectIdSchema).max(50).default([]),
    tagMatch: z.enum(["any", "all"]).default("any"),
  })
  .strict();

export const newsletterAudienceSegmentsInputSchema = z
  .object({
    segments: z.array(newsletterAudienceSegmentSchema).min(1).max(1),
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

export type NewsletterAudienceSegmentsInput = z.infer<
  typeof newsletterAudienceSegmentsInputSchema
>;
export type NewsletterScheduleInput = z.infer<typeof newsletterScheduleInputSchema>;
