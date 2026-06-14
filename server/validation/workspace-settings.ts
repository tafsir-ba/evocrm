import "server-only";

import { z } from "zod";

const workspaceTypes = ["agency", "developer", "brokerage", "other"] as const;

export const updateWorkspaceSettingsSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    type: z.enum(workspaceTypes).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    defaultCurrency: z
      .string()
      .trim()
      .length(3)
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code.")
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export type UpdateWorkspaceSettingsInput = z.infer<
  typeof updateWorkspaceSettingsSchema
>;
