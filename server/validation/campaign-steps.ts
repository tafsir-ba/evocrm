import "server-only";

import { z } from "zod";

import { objectIdSchema } from "@/server/validation/campaigns";

const sendTimeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Send time must use HH:mm format (e.g. 09:00).");

const stepStatusSchema = z.enum(["draft", "ready", "active", "paused"]);
const contentModeSchema = z.enum(["rich_text", "plain_text", "html"]);
const delayUnitSchema = z.enum(["days", "hours"]);

const optionalBodySchema = z.string().trim().max(50_000).optional();
const optionalSubjectSchema = z.string().trim().max(500).optional();

export const createCampaignStepInputSchema = z
  .object({
    order: z.number().int().min(1),
    name: z.string().trim().min(1).max(200).optional(),
    delayDays: z.number().int().min(0),
    delayAmount: z.number().int().min(0).optional(),
    delayUnit: delayUnitSchema.optional(),
    sendTime: sendTimeSchema,
    fromName: z.string().trim().min(1).max(120).optional(),
    channel: z.literal("email").default("email"),
    status: stepStatusSchema.optional(),
    contentMode: contentModeSchema.optional(),
    subject: optionalSubjectSchema,
    previewText: z.string().trim().max(500).nullable().optional(),
    body: optionalBodySchema,
    bodyHtml: z.string().max(200_000).nullable().optional(),
    bodyText: z.string().max(50_000).nullable().optional(),
    documentIds: z.array(objectIdSchema).max(20).optional(),
  })
  .strict();

export const updateCampaignStepInputSchema = z
  .object({
    order: z.number().int().min(1).optional(),
    name: z.string().trim().min(1).max(200).nullable().optional(),
    delayDays: z.number().int().min(0).optional(),
    delayAmount: z.number().int().min(0).optional(),
    delayUnit: delayUnitSchema.optional(),
    sendTime: sendTimeSchema.optional(),
    fromName: z.string().trim().min(1).max(120).nullable().optional(),
    status: stepStatusSchema.optional(),
    contentMode: contentModeSchema.optional(),
    subject: optionalSubjectSchema,
    previewText: z.string().trim().max(500).nullable().optional(),
    body: optionalBodySchema,
    bodyHtml: z.string().max(200_000).nullable().optional(),
    bodyText: z.string().max(50_000).nullable().optional(),
    documentIds: z.array(objectIdSchema).max(20).optional(),
  })
  .strict();

export const reorderCampaignStepsInputSchema = z
  .object({
    stepIds: z.array(objectIdSchema).min(1).max(50),
  })
  .strict();

export const duplicateCampaignStepInputSchema = z.object({}).strict();

export const testCampaignStepEmailInputSchema = z
  .object({
    to: z.string().email(),
  })
  .strict();

export type CreateCampaignStepInput = z.infer<typeof createCampaignStepInputSchema>;
export type UpdateCampaignStepInput = z.infer<typeof updateCampaignStepInputSchema>;
export type ReorderCampaignStepsInput = z.infer<typeof reorderCampaignStepsInputSchema>;
