import "server-only";

import { z } from "zod";

import { objectIdSchema } from "@/server/validation/campaigns";

export const createCampaignStepInputSchema = z
  .object({
    order: z.number().int().min(1),
    delayDays: z.number().int().min(0),
    channel: z.literal("email").default("email"),
    subject: z.string().trim().min(1).max(500),
    body: z.string().trim().min(1).max(50_000),
    documentIds: z.array(objectIdSchema).max(20).optional(),
  })
  .strict();

export const updateCampaignStepInputSchema = z
  .object({
    order: z.number().int().min(1).optional(),
    delayDays: z.number().int().min(0).optional(),
    subject: z.string().trim().min(1).max(500).optional(),
    body: z.string().trim().min(1).max(50_000).optional(),
    documentIds: z.array(objectIdSchema).max(20).optional(),
  })
  .strict();

export type CreateCampaignStepInput = z.infer<typeof createCampaignStepInputSchema>;
export type UpdateCampaignStepInput = z.infer<typeof updateCampaignStepInputSchema>;
