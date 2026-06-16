import "server-only";

import { z } from "zod";

import { objectIdSchema } from "@/server/validation/campaigns";

const domainNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Domain name is required.")
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/,
    "Enter a valid domain name (e.g. example.com).",
  );

export const createSendingDomainInputSchema = z
  .object({
    domain: domainNameSchema,
    defaultSenderEmail: z.string().email().optional(),
  })
  .strict();

export const updateSendingDomainInputSchema = z
  .object({
    defaultSenderEmail: z.string().email().nullable().optional(),
  })
  .strict();

export const senderEmailQuerySchema = z.object({
  sendingDomainId: objectIdSchema,
});

export type CreateSendingDomainInput = z.infer<typeof createSendingDomainInputSchema>;
export type UpdateSendingDomainInput = z.infer<typeof updateSendingDomainInputSchema>;
