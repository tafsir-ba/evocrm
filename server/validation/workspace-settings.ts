import "server-only";

import { z } from "zod";

import { supportedCurrencySchema, supportedTimezoneSchema } from "@/server/validation/locale";

const workspaceTypes = ["agency", "developer", "brokerage", "other"] as const;

export const workspaceTypeSchema = z.enum(workspaceTypes);

export const updateWorkspaceSettingsSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    type: workspaceTypeSchema.optional(),
    timezone: supportedTimezoneSchema.optional(),
    defaultCurrency: supportedCurrencySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export type UpdateWorkspaceSettingsInput = z.infer<
  typeof updateWorkspaceSettingsSchema
>;
