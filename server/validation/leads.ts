import "server-only";

import { z } from "zod";

import {
  PROPERTY_TYPE_INTERESTS,
  TRANSACTION_INTENTS,
  USAGE_PURPOSES,
} from "@/lib/lead-preferences";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

const emailConsentStatusSchema = z.enum(["unknown", "subscribed", "unsubscribed"]);

const preferredContactMethodSchema = z.enum(["email", "phone", "whatsapp", "sms"]);

const attributesSchema = z
  .record(z.unknown())
  .optional()
  .refine(
    (value) => value === undefined || JSON.stringify(value).length <= 10_000,
    { message: "Attributes payload is too large." },
  );

const preferredAreasSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(20)
  .optional();

const propertyTypeInterestsSchema = z
  .array(z.enum(PROPERTY_TYPE_INTERESTS))
  .max(PROPERTY_TYPE_INTERESTS.length)
  .optional();

const transactionIntentSchema = z.enum(TRANSACTION_INTENTS);
const usagePurposeSchema = z.enum(USAGE_PURPOSES);

export const leadListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  search: z.string().trim().max(120).optional(),
  projectId: objectIdSchema.optional(),
  companyId: objectIdSchema.optional(),
  includeAssociated: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  statusId: objectIdSchema.optional(),
  sourceId: objectIdSchema.optional(),
  assignedTo: objectIdSchema.optional(),
  ownerId: objectIdSchema.optional(),
  tagId: objectIdSchema.optional(),
  propertyTypeInterest: z.enum(PROPERTY_TYPE_INTERESTS).optional(),
  transactionIntent: transactionIntentSchema.optional(),
  usagePurpose: usagePurposeSchema.optional(),
  industry: z.string().trim().max(120).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  stateRegion: z.string().trim().max(120).optional(),
  integrationId: objectIdSchema.optional(),
  utmCampaign: z.string().trim().min(1).max(120).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
});

const createLeadBudgetRefinement = {
  refine: (value: { budgetMin?: number; budgetMax?: number }) =>
    value.budgetMin === undefined ||
    value.budgetMax === undefined ||
    value.budgetMax >= value.budgetMin,
  message: "budgetMax must be greater than or equal to budgetMin.",
} as const;

const createLeadInputObjectSchema = z
  .object({
    projectId: objectIdSchema,
    statusId: objectIdSchema,
    sourceId: objectIdSchema.optional(),
    ownerId: objectIdSchema.optional(),
    assignedTo: objectIdSchema.optional(),
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().max(40).optional(),
    language: z.string().trim().max(16).optional(),
    preferredContactMethod: preferredContactMethodSchema.optional(),
    budgetMin: z.number().min(0).optional(),
    budgetMax: z.number().min(0).optional(),
    preferredAreas: preferredAreasSchema,
    propertyTypeInterests: propertyTypeInterestsSchema,
    transactionIntent: transactionIntentSchema.optional(),
    usagePurpose: usagePurposeSchema.optional(),
    industry: z.string().trim().max(120).nullable().optional(),
    jobTitle: z.string().trim().max(120).nullable().optional(),
    stateRegion: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(5000).optional(),
    tags: z.array(objectIdSchema).max(20).optional(),
    attributes: attributesSchema,
    emailConsentStatus: emailConsentStatusSchema.optional(),
    companyId: objectIdSchema.optional(),
    createdAt: z.coerce.date().optional(),
  })
  .strict();

export const createLeadInputSchema = createLeadInputObjectSchema.refine(
  createLeadBudgetRefinement.refine,
  { message: createLeadBudgetRefinement.message },
);

export const createLeadApiInputSchema = createLeadInputObjectSchema
  .omit({ createdAt: true })
  .refine(createLeadBudgetRefinement.refine, {
    message: createLeadBudgetRefinement.message,
  });

export const updateLeadInputSchema = z
  .object({
    statusId: objectIdSchema.optional(),
    sourceId: objectIdSchema.nullable().optional(),
    ownerId: objectIdSchema.nullable().optional(),
    assignedTo: objectIdSchema.nullable().optional(),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().max(320).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    language: z.string().trim().max(16).nullable().optional(),
    preferredContactMethod: preferredContactMethodSchema.nullable().optional(),
    budgetMin: z.number().min(0).nullable().optional(),
    budgetMax: z.number().min(0).nullable().optional(),
    preferredAreas: preferredAreasSchema,
    propertyTypeInterests: propertyTypeInterestsSchema,
    transactionIntent: transactionIntentSchema.nullable().optional(),
    usagePurpose: usagePurposeSchema.nullable().optional(),
    industry: z.string().trim().max(120).nullable().optional(),
    jobTitle: z.string().trim().max(120).nullable().optional(),
    stateRegion: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    tags: z.array(objectIdSchema).max(20).optional(),
    attributes: attributesSchema,
    emailConsentStatus: emailConsentStatusSchema.optional(),
    emailUnsubscribedAt: z.coerce.date().nullable().optional(),
    emailUnsubscribeReason: z.string().trim().max(500).nullable().optional(),
    companyId: objectIdSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  })
  .refine(
    (value) =>
      value.budgetMin === undefined ||
      value.budgetMax === undefined ||
      value.budgetMin === null ||
      value.budgetMax === null ||
      value.budgetMax >= value.budgetMin,
    { message: "budgetMax must be greater than or equal to budgetMin." },
  );

export type CreateLeadInput = z.infer<typeof createLeadInputSchema>;
export type CreateLeadApiInput = z.infer<typeof createLeadApiInputSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadInputSchema>;
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

const bulkDeleteLeadFiltersSchema = leadListQuerySchema
  .omit({ page: true, pageSize: true })
  .partial();

export const bulkDeleteLeadsInputSchema = z
  .object({
    leadIds: z.array(objectIdSchema).min(1).max(1000).optional(),
    selectAll: z.literal(true).optional(),
    excludeLeadIds: z.array(objectIdSchema).max(1000).optional(),
    filters: bulkDeleteLeadFiltersSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.leadIds?.length) || value.selectAll === true, {
    message: "Either leadIds or selectAll must be provided.",
  })
  .refine((value) => !(value.leadIds?.length && value.selectAll), {
    message: "leadIds and selectAll cannot be used together.",
  });

export type BulkDeleteLeadsInput = z.infer<typeof bulkDeleteLeadsInputSchema>;
