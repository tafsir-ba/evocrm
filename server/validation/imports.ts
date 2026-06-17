import "server-only";

import { z } from "zod";

import {
  IMPORT_ENTITY_TYPES,
  IMPORT_EXECUTE_MODES,
} from "@/lib/imports";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

export const importConfigQuerySchema = z.object({
  entityType: z.enum(IMPORT_ENTITY_TYPES),
});

export const createImportJobSchema = z.object({
  entityType: z.enum(IMPORT_ENTITY_TYPES),
});

export const importMappingSchema = z.object({
  sourceColumnIndex: z.number().int().min(0),
  targetField: z.string().trim().min(1).nullable(),
});

export const saveImportMappingSchema = z.object({
  mappings: z.array(importMappingSchema),
  defaults: z.record(z.string()).default({}),
  hasHeaderRow: z.boolean().optional(),
  headerRowIndex: z.number().int().min(0).optional(),
});

export const parseImportSchema = z.object({
  hasHeaderRow: z.boolean().default(true),
  headerRowIndex: z.number().int().min(0).default(0),
  preserveMappings: z.boolean().default(false),
});

export const executeImportSchema = z.object({
  mode: z.enum(IMPORT_EXECUTE_MODES).default("valid_rows_only"),
});

export type SaveImportMappingInput = z.infer<typeof saveImportMappingSchema>;
export type ParseImportInput = z.infer<typeof parseImportSchema>;
export type ExecuteImportInput = z.infer<typeof executeImportSchema>;
