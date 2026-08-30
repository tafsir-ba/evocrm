import "server-only";

import { z } from "zod";

import {
  PROJECT_LOCATION_CONFIDENCE,
  PROJECT_LOCATION_PRECISIONS,
  PROJECT_LOCATION_REVIEW_STATUSES,
} from "@/lib/project-location";

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

const projectLocationInputSchema = z
  .object({
    countryCode: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase())
      .nullable()
      .optional(),
    countryName: z.string().trim().max(120).nullable().optional(),
    cantonCode: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase())
      .nullable()
      .optional(),
    cantonName: z.string().trim().max(120).nullable().optional(),
    municipality: z.string().trim().max(120).nullable().optional(),
    postalCode: z.string().trim().max(32).nullable().optional(),
    normalizedAddress: z.string().trim().max(240).nullable().optional(),
    latitude: z.number().gte(-90).lte(90).nullable().optional(),
    longitude: z.number().gte(-180).lte(180).nullable().optional(),
    precision: z.enum(PROJECT_LOCATION_PRECISIONS).optional(),
    sourceUrl: z.string().trim().url().max(500).nullable().optional(),
    confidence: z.enum(PROJECT_LOCATION_CONFIDENCE).nullable().optional(),
    reviewStatus: z.enum(PROJECT_LOCATION_REVIEW_STATUSES).optional(),
  })
  .strict();

export const projectListQuerySchema = z.object({
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  search: z.string().trim().max(120).optional(),
  assignedTo: objectIdSchema.optional(),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .optional(),
  cantonCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .optional(),
  municipality: z.string().trim().max(120).optional(),
  withCounts: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  view: z.enum(["all", "active", "stale", "needs_attention", "archived"]).optional(),
  sort: z.enum(["inbound", "leads", "status", "name"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
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
    location: projectLocationInputSchema.optional(),
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
    location: projectLocationInputSchema.nullable().optional(),
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
