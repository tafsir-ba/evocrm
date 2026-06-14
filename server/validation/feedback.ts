import "server-only";

import { z } from "zod";

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_DEFAULT_LIST_LIMIT,
  FEEDBACK_MAX_LIST_LIMIT,
  FEEDBACK_STATUSES,
  MAX_FEEDBACK_BODY_CHARS,
  MAX_FEEDBACK_PAGE_URL_CHARS,
  MAX_FEEDBACK_USER_AGENT_CHARS,
} from "@/server/feedback/constants";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Invalid identifier.");

export const feedbackCategorySchema = z.enum(FEEDBACK_CATEGORIES);

export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);

export const feedbackListQuerySchema = z.object({
  status: feedbackStatusSchema.optional(),
  category: feedbackCategorySchema.optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(FEEDBACK_MAX_LIST_LIMIT)
    .default(FEEDBACK_DEFAULT_LIST_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export const feedbackStatusUpdateSchema = z.object({
  status: feedbackStatusSchema,
});

export const feedbackSubmitFieldsSchema = z.object({
  category: feedbackCategorySchema.default("bug"),
  body: z.string().max(MAX_FEEDBACK_BODY_CHARS).optional(),
  pageUrl: z.string().max(MAX_FEEDBACK_PAGE_URL_CHARS).optional(),
  userAgent: z.string().max(MAX_FEEDBACK_USER_AGENT_CHARS).optional(),
  projectId: objectIdSchema.optional(),
  workspaceSlug: z.string().trim().min(1).max(120),
});

export type FeedbackListQuery = z.infer<typeof feedbackListQuerySchema>;
export type FeedbackStatusUpdateInput = z.infer<typeof feedbackStatusUpdateSchema>;
export type FeedbackSubmitFields = z.infer<typeof feedbackSubmitFieldsSchema>;
