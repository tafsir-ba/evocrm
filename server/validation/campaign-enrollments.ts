import "server-only";

import { z } from "zod";

import { objectIdSchema } from "@/server/validation/campaigns";

export const createCampaignEnrollmentInputSchema = z
  .object({
    leadId: objectIdSchema.optional(),
    opportunityId: objectIdSchema.optional(),
  })
  .strict()
  .refine((value) => value.leadId || value.opportunityId, {
    message: "Either leadId or opportunityId is required.",
  });

export const updateCampaignEnrollmentInputSchema = z
  .object({
    status: z.enum(["active", "paused"]).optional(),
  })
  .strict();

export const campaignEnrollmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z
    .enum(["active", "paused", "completed", "unsubscribed", "failed"])
    .optional(),
});

export const campaignEnrollmentCandidatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(120).optional(),
});

export type CreateCampaignEnrollmentInput = z.infer<
  typeof createCampaignEnrollmentInputSchema
>;
export type UpdateCampaignEnrollmentInput = z.infer<
  typeof updateCampaignEnrollmentInputSchema
>;
