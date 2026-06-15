import "server-only";

import { z } from "zod";

import { objectIdSchema } from "@/server/validation/campaigns";

const sendTimeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Send time must use HH:mm format (e.g. 09:00).");

const fromNameSchema = z
  .string()
  .trim()
  .min(1, "From name is required for each step.")
  .max(120);

export const createCampaignStepInputSchema = z
  .object({
    order: z.number().int().min(1),
    delayDays: z.number().int().min(0),
    sendTime: sendTimeSchema,
    fromName: fromNameSchema,
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
    sendTime: sendTimeSchema.optional(),
    fromName: fromNameSchema.optional(),
    subject: z.string().trim().min(1).max(500).optional(),
    body: z.string().trim().min(1).max(50_000).optional(),
    documentIds: z.array(objectIdSchema).max(20).optional(),
  })
  .strict();

export type CreateCampaignStepInput = z.infer<typeof createCampaignStepInputSchema>;
export type UpdateCampaignStepInput = z.infer<typeof updateCampaignStepInputSchema>;
