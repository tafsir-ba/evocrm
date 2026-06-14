import "server-only";

import { z } from "zod";

import { objectIdSchema } from "@/server/validation/common";

const membershipStatusSchema = z.enum([
  "active",
  "invited",
  "suspended",
  "removed",
]);

export const membershipListQuerySchema = z.object({
  status: membershipStatusSchema.optional(),
});

export const createMembershipInputSchema = z.object({
  email: z.string().trim().email().max(254),
  roleId: objectIdSchema,
});

export const updateMembershipInputSchema = z
  .object({
    roleId: objectIdSchema.optional(),
    status: membershipStatusSchema.optional(),
  })
  .refine((value) => value.roleId !== undefined || value.status !== undefined, {
    message: "At least one field must be provided.",
  });

export type CreateMembershipInput = z.infer<typeof createMembershipInputSchema>;
export type UpdateMembershipInput = z.infer<typeof updateMembershipInputSchema>;
