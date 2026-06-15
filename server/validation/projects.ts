import "server-only";

import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

const referenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Reference must contain only letters, numbers, dots, underscores, or hyphens.",
  );

const projectTypeSchema = z.enum([
  "development",
  "resale_mandate",
  "rental_project",
  "other",
]);

export const projectListQuerySchema = z.object({
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  search: z.string().trim().max(120).optional(),
  assignedTo: objectIdSchema.optional(),
  withCounts: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
});

export const createProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    reference: referenceSchema.optional(),
    projectType: projectTypeSchema.optional(),
    defaultDripCampaignId: objectIdSchema.nullable().optional(),
    statusId: objectIdSchema.optional(),
    address: z.string().trim().max(200).optional(),
    city: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    ownerId: objectIdSchema.optional(),
    assignedTo: objectIdSchema.optional(),
  })
  .strict();

export const updateProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    reference: referenceSchema.nullable().optional(),
    projectType: projectTypeSchema.nullable().optional(),
    defaultDripCampaignId: objectIdSchema.nullable().optional(),
    statusId: objectIdSchema.nullable().optional(),
    address: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    country: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    ownerId: objectIdSchema.nullable().optional(),
    assignedTo: objectIdSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
