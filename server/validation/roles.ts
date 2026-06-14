import "server-only";

import { z } from "zod";

import { PERMISSION_KEYS } from "@/server/permissions/permissions";
import { objectIdSchema } from "@/server/validation/common";

const permissionSchema = z.enum(PERMISSION_KEYS);

export const createRoleInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/, "Key must be lowercase alphanumeric with underscores or hyphens."),
  permissions: z.array(permissionSchema).min(1),
});

export const updateRoleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    permissions: z.array(permissionSchema).min(1).optional(),
  })
  .refine((value) => value.name !== undefined || value.permissions !== undefined, {
    message: "At least one field must be provided.",
  });

export type CreateRoleInput = z.infer<typeof createRoleInputSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleInputSchema>;
