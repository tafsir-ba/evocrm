import "server-only";

import { z } from "zod";

import { isValidHexColor } from "@/lib/dictionary-colors";
import {
  ACTIVITY_STATUS_BEHAVIORS,
  DICTIONARY_TYPES,
  OPPORTUNITY_STATUS_BEHAVIORS,
  TAG_ENTITY_TYPES,
} from "@/server/dictionaries/constants";

export const hexColorSchema = z
  .string()
  .trim()
  .refine(isValidHexColor, { message: "Color must be a valid hex value (#RGB or #RRGGBB)." });

export const dictionaryTypeSchema = z.enum(DICTIONARY_TYPES);

export const dictionaryListQuerySchema = z.object({
  type: dictionaryTypeSchema.optional(),
  includeInactive: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
});

export const dictionaryItemListQuerySchema = z.object({
  type: dictionaryTypeSchema.optional(),
  dictionaryId: z.string().trim().min(1).optional(),
  includeInactive: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
});

export const createDictionaryItemInputSchema = z
  .object({
    dictionaryId: z.string().trim().min(1),
    type: dictionaryTypeSchema,
    label: z.string().trim().min(1).max(120),
    key: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9_]+$/, "Key must be lowercase alphanumeric with underscores."),
    color: hexColorSchema,
    order: z.number().int().min(0).optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    behavior: z.string().trim().optional(),
    defaultProbability: z.number().int().min(0).max(100).optional(),
  })
  .strict();

export const updateDictionaryItemInputSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    color: hexColorSchema.optional(),
    order: z.number().int().min(0).optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    behavior: z.string().trim().optional(),
    defaultProbability: z.number().int().min(0).max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const opportunityBehaviorSchema = z.enum(OPPORTUNITY_STATUS_BEHAVIORS);
export const activityBehaviorSchema = z.enum(ACTIVITY_STATUS_BEHAVIORS);

export const tagEntityTypeSchema = z.enum(TAG_ENTITY_TYPES);

export const tagListQuerySchema = z.object({
  entityType: tagEntityTypeSchema.optional(),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
});

export const createTagInputSchema = z
  .object({
    name: z.string().trim().min(1).max(64),
    color: hexColorSchema,
    entityTypes: z.array(tagEntityTypeSchema).min(1),
  })
  .strict();

export const updateTagInputSchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    color: hexColorSchema.optional(),
    entityTypes: z.array(tagEntityTypeSchema).min(1).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export type CreateDictionaryItemInput = z.infer<typeof createDictionaryItemInputSchema>;
export type UpdateDictionaryItemInput = z.infer<typeof updateDictionaryItemInputSchema>;
export type CreateTagInput = z.infer<typeof createTagInputSchema>;
export type UpdateTagInput = z.infer<typeof updateTagInputSchema>;
