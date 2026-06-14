import "server-only";

import { z } from "zod";

export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

const campaignListStatusSchema = z.enum(["draft", "active", "paused", "archived"]);
const campaignUpdateStatusSchema = z.enum(["draft", "active", "paused"]);
const audienceTypeSchema = z.enum(["leads", "opportunities"]);

export const campaignListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  status: campaignListStatusSchema.optional(),
  audienceType: audienceTypeSchema.optional(),
  search: z.string().trim().max(120).optional(),
});

export const createCampaignInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    audienceType: audienceTypeSchema,
    frequency: z.string().trim().max(120).optional(),
    ownerId: objectIdSchema.optional(),
  })
  .strict();

export const updateCampaignInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    frequency: z.string().trim().max(120).nullable().optional(),
    ownerId: objectIdSchema.nullable().optional(),
    status: campaignUpdateStatusSchema.optional(),
  })
  .strict();

export const campaignSendListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(["queued", "sent", "failed", "skipped"]).optional(),
});

export const cronSendDueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const unsubscribeTokenQuerySchema = z.object({
  token: z.string().trim().min(1),
});

export type CreateCampaignInput = z.infer<typeof createCampaignInputSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignInputSchema>;
