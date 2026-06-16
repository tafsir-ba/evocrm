import "server-only";

import { z } from "zod";

import { supportedCurrencySchema } from "@/server/validation/locale";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

const opportunityBehaviorSchema = z.enum(["open", "terminal_won", "terminal_lost"]);

export const opportunityListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  search: z.string().trim().max(120).optional(),
  projectId: objectIdSchema.optional(),
  statusId: objectIdSchema.optional(),
  leadId: objectIdSchema.optional(),
  propertyId: objectIdSchema.optional(),
  assignedTo: objectIdSchema.optional(),
  ownerId: objectIdSchema.optional(),
  tagId: objectIdSchema.optional(),
  behavior: opportunityBehaviorSchema.optional(),
  expectedCloseFrom: z.coerce.date().optional(),
  expectedCloseTo: z.coerce.date().optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  closedFrom: z.coerce.date().optional(),
  closedTo: z.coerce.date().optional(),
});

export const createOpportunityInputSchema = z
  .object({
    leadId: objectIdSchema,
    propertyId: objectIdSchema,
    statusId: objectIdSchema,
    ownerId: objectIdSchema.optional(),
    assignedTo: objectIdSchema.optional(),
    value: z.number().min(0).optional(),
    currency: supportedCurrencySchema.optional(),
    expectedCloseDate: z.coerce.date().optional(),
    lostReasonId: objectIdSchema.nullable().optional(),
    lostReasonText: z.string().trim().max(500).nullable().optional(),
    notes: z.string().trim().max(5000).optional(),
    tags: z.array(objectIdSchema).max(20).optional(),
  })
  .strict();

export const updateOpportunityInputSchema = z
  .object({
    leadId: objectIdSchema.optional(),
    propertyId: objectIdSchema.optional(),
    statusId: objectIdSchema.optional(),
    ownerId: objectIdSchema.nullable().optional(),
    assignedTo: objectIdSchema.nullable().optional(),
    value: z.number().min(0).nullable().optional(),
    currency: supportedCurrencySchema.optional(),
    expectedCloseDate: z.coerce.date().nullable().optional(),
    lostReasonId: objectIdSchema.nullable().optional(),
    lostReasonText: z.string().trim().max(500).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    tags: z.array(objectIdSchema).max(20).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const stageOpportunityInputSchema = z
  .object({
    statusId: objectIdSchema,
    lostReasonId: objectIdSchema.optional(),
    lostReasonText: z.string().trim().max(500).optional(),
  })
  .strict();

export const pipelineQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  projectId: objectIdSchema.optional(),
  statusId: objectIdSchema.optional(),
  assignedTo: objectIdSchema.optional(),
  ownerId: objectIdSchema.optional(),
  tagId: objectIdSchema.optional(),
  leadId: objectIdSchema.optional(),
  propertyId: objectIdSchema.optional(),
});

export type CreateOpportunityInput = z.infer<typeof createOpportunityInputSchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunityInputSchema>;
export type StageOpportunityInput = z.infer<typeof stageOpportunityInputSchema>;
export type OpportunityListQuery = z.infer<typeof opportunityListQuerySchema>;
export type PipelineQuery = z.infer<typeof pipelineQuerySchema>;
