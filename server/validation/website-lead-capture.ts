import "server-only";

import { z } from "zod";

import { objectIdSchema } from "@/server/validation/campaigns";

const utmSchema = z
  .object({
    source: z.string().trim().max(120).optional(),
    medium: z.string().trim().max(120).optional(),
    campaign: z.string().trim().max(120).optional(),
    term: z.string().trim().max(120).optional(),
    content: z.string().trim().max(120).optional(),
  })
  .strict();

export const websiteLeadCaptureInputSchema = z
  .object({
    externalId: z.string().trim().max(200).optional(),
    idempotencyKey: z.string().trim().max(200).optional(),
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().max(40).optional(),
    message: z.string().trim().max(5000).optional(),
    source: z.string().trim().max(120).optional(),
    preferredAreas: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    budgetMin: z.number().min(0).optional(),
    budgetMax: z.number().min(0).optional(),
    propertyReference: z.string().trim().max(120).optional(),
    projectId: objectIdSchema.optional(),
    projectReference: z.string().trim().min(1).max(120).optional(),
    utm: utmSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.email?.trim() || value.phone?.trim()), {
    message: "At least one of email or phone is required.",
    path: ["email"],
  })
  .refine(
    (value) =>
      value.budgetMin === undefined ||
      value.budgetMax === undefined ||
      value.budgetMax >= value.budgetMin,
    {
      message: "budgetMax must be greater than or equal to budgetMin.",
      path: ["budgetMax"],
    },
  );

export type WebsiteLeadCaptureInput = z.infer<typeof websiteLeadCaptureInputSchema>;
