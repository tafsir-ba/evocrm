import "server-only";

import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

const currencySchema = z
  .string()
  .trim()
  .min(3)
  .max(3)
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code.");

const attributesSchema = z
  .record(z.unknown())
  .optional()
  .refine(
    (value) => value === undefined || JSON.stringify(value).length <= 10_000,
    { message: "Attributes payload is too large." },
  );

const featuresSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(30)
  .optional();

export const propertyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  search: z.string().trim().max(120).optional(),
  statusId: objectIdSchema.optional(),
  typeId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  assignedTo: objectIdSchema.optional(),
  ownerId: objectIdSchema.optional(),
  tagId: objectIdSchema.optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
}).refine(
  (value) =>
    value.minPrice === undefined ||
    value.maxPrice === undefined ||
    value.maxPrice >= value.minPrice,
  { message: "maxPrice must be greater than or equal to minPrice." },
);

export const createPropertyInputSchema = z
  .object({
    projectId: objectIdSchema.optional(),
    statusId: objectIdSchema,
    typeId: objectIdSchema.optional(),
    ownerId: objectIdSchema.optional(),
    assignedTo: objectIdSchema.optional(),
    title: z.string().trim().min(1).max(200),
    reference: z.string().trim().max(80).optional(),
    price: z.number().min(0).optional(),
    currency: currencySchema.optional(),
    address: z.string().trim().max(300).optional(),
    city: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional(),
    rooms: z.number().min(0).optional(),
    bedrooms: z.number().min(0).optional(),
    bathrooms: z.number().min(0).optional(),
    surface: z.number().min(0).optional(),
    floor: z.number().optional(),
    description: z.string().trim().max(5000).optional(),
    features: featuresSchema,
    tags: z.array(objectIdSchema).max(20).optional(),
    attributes: attributesSchema,
  })
  .strict();

export const updatePropertyInputSchema = z
  .object({
    projectId: objectIdSchema.nullable().optional(),
    statusId: objectIdSchema.optional(),
    typeId: objectIdSchema.nullable().optional(),
    ownerId: objectIdSchema.nullable().optional(),
    assignedTo: objectIdSchema.nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    reference: z.string().trim().max(80).nullable().optional(),
    price: z.number().min(0).nullable().optional(),
    currency: currencySchema.optional(),
    address: z.string().trim().max(300).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    country: z.string().trim().max(120).nullable().optional(),
    rooms: z.number().min(0).nullable().optional(),
    bedrooms: z.number().min(0).nullable().optional(),
    bathrooms: z.number().min(0).nullable().optional(),
    surface: z.number().min(0).nullable().optional(),
    floor: z.number().nullable().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    features: featuresSchema,
    tags: z.array(objectIdSchema).max(20).optional(),
    attributes: attributesSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export type CreatePropertyInput = z.infer<typeof createPropertyInputSchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertyInputSchema>;
export type PropertyListQuery = z.infer<typeof propertyListQuerySchema>;
