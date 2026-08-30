import "server-only";

import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

export const createLeadProjectMembershipInputSchema = z
  .object({
    projectId: objectIdSchema,
    isPrimary: z.boolean().optional(),
    joinedAt: z.coerce.date().optional(),
  })
  .strict();

export const updateLeadProjectMembershipInputSchema = z
  .object({
    isPrimary: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const reorderLeadProjectMembershipsInputSchema = z
  .object({
    membershipIds: z.array(objectIdSchema).min(1).max(50),
  })
  .strict();

export type CreateLeadProjectMembershipInput = z.infer<
  typeof createLeadProjectMembershipInputSchema
>;
export type UpdateLeadProjectMembershipInput = z.infer<
  typeof updateLeadProjectMembershipInputSchema
>;
export type ReorderLeadProjectMembershipsInput = z.infer<
  typeof reorderLeadProjectMembershipsInputSchema
>;
