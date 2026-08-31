import "server-only";

import { z } from "zod";

import {
  PROJECT_LOCATION_CONFIDENCE,
  PROJECT_LOCATION_PRECISIONS,
  PROJECT_LOCATION_REVIEW_STATUSES,
} from "@/lib/project-location";
import { PRIMARY_COMPANY_REQUIRED_MESSAGE } from "@/lib/project-operating-record";

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

const commercialStageSchema = z.enum(["planned", "pre_launch", "live", "sold_closed"]);

const projectCompanyRoleSchema = z.enum([
  "developer",
  "owner",
  "marketing_sales_partner",
]);

const emptyStringToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const optionalIsoCode = z.preprocess(
  emptyStringToNull,
  z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
);

const optionalTrimmed = (max: number) =>
  z.preprocess(
    emptyStringToNull,
    z.string().trim().max(max).nullable().optional(),
  );

const optionalSourceUrl = z.preprocess(
  emptyStringToNull,
  z.string().trim().url().max(500).nullable().optional(),
);

const projectLocationInputSchema = z.object({
  countryCode: optionalIsoCode,
  countryName: optionalTrimmed(120),
  cantonCode: optionalIsoCode,
  cantonName: optionalTrimmed(120),
  municipality: optionalTrimmed(120),
  postalCode: optionalTrimmed(32),
  normalizedAddress: optionalTrimmed(240),
  latitude: z.number().gte(-90).lte(90).nullable().optional(),
  longitude: z.number().gte(-180).lte(180).nullable().optional(),
  precision: z.enum(PROJECT_LOCATION_PRECISIONS).optional(),
  sourceUrl: optionalSourceUrl,
  confidence: z.enum(PROJECT_LOCATION_CONFIDENCE).nullable().optional(),
  reviewStatus: z.enum(PROJECT_LOCATION_REVIEW_STATUSES).optional(),
});

const projectCompanyProvenanceSchema = z
  .object({
    method: z.enum(["workbook_import", "manual"]),
    relationship: z.enum(["billed_linked", "unspecified"]),
    source: z.string().trim().max(200),
    appliedAt: z.string().trim().max(64),
    notes: z.string().trim().max(500),
  })
  .nullable()
  .optional();

const projectCompanySchema = z.object({
  companyId: objectIdSchema,
  role: projectCompanyRoleSchema,
  isPrimary: z.boolean().optional(),
  provenance: projectCompanyProvenanceSchema,
});

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
    commercialStage: commercialStageSchema.optional(),
    propertyTypeId: objectIdSchema.nullable().optional(),
    website: z.string().trim().max(300).optional(),
    address: z.string().trim().max(200).optional(),
    city: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional(),
    location: projectLocationInputSchema.optional(),
    companies: z.array(projectCompanySchema).max(20).optional(),
    description: z.string().trim().max(2000).optional(),
    ownerId: objectIdSchema.optional(),
    assignedTo: objectIdSchema.optional(),
  })
  .strict()
  .refine((value) => (value.companies ?? []).some((item) => item.role === "developer"), {
    message: PRIMARY_COMPANY_REQUIRED_MESSAGE,
    path: ["companies"],
  });

export const updateProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    reference: referenceSchema.nullable().optional(),
    projectType: projectTypeSchema.nullable().optional(),
    defaultDripCampaignId: objectIdSchema.nullable().optional(),
    statusId: objectIdSchema.nullable().optional(),
    commercialStage: commercialStageSchema.nullable().optional(),
    propertyTypeId: objectIdSchema.nullable().optional(),
    website: z.string().trim().max(300).nullable().optional(),
    address: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    country: z.string().trim().max(120).nullable().optional(),
    location: projectLocationInputSchema.nullable().optional(),
    companies: z.array(projectCompanySchema).max(20).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    ownerId: objectIdSchema.nullable().optional(),
    assignedTo: objectIdSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  })
  .refine(
    (value) =>
      value.companies === undefined || value.companies.some((item) => item.role === "developer"),
    {
      message: PRIMARY_COMPANY_REQUIRED_MESSAGE,
      path: ["companies"],
    },
  );

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
