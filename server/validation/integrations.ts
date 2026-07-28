import "server-only";

import { z } from "zod";

import {
  INTEGRATION_STATUSES,
  INTEGRATION_TYPES,
} from "@/models/integration";
import { INTEGRATION_LOG_STATUSES } from "@/models/integration-log";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

export const integrationListQuerySchema = z.object({
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  type: z.enum(INTEGRATION_TYPES).optional(),
  status: z.enum(INTEGRATION_STATUSES).optional(),
});

export const createIntegrationInputSchema = z
  .object({
    type: z.enum(INTEGRATION_TYPES),
    name: z.string().trim().min(1).max(120),
    defaultProjectId: objectIdSchema.nullable().optional(),
    allowProjectOverride: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.type === "website" ||
      (value.defaultProjectId === undefined && value.allowProjectOverride === undefined),
    {
      message: "Project routing fields are only supported for website integrations.",
      path: ["defaultProjectId"],
    },
  );

export const updateIntegrationInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    status: z.enum(INTEGRATION_STATUSES).optional(),
    defaultProjectId: objectIdSchema.nullable().optional(),
    allowProjectOverride: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  })
  .refine((value) => value.status !== "archived", {
    message: "Use DELETE to archive integrations.",
    path: ["status"],
  });

export const integrationIdParamSchema = z.object({
  integrationId: objectIdSchema,
});

export const integrationLogListQuerySchema = z.object({
  status: z.enum(INTEGRATION_LOG_STATUSES).optional(),
  eventType: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type CreateIntegrationInput = z.infer<typeof createIntegrationInputSchema>;
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationInputSchema>;
