import "server-only";

import { z } from "zod";

import { HUBSPOT_PROJECT_MAPPING_STATUSES } from "@/models/hubspot-project-mapping";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

export const hubspotProjectMappingUpdateSchema = z
  .object({
    hubspotProjectId: z.string().trim().min(1).max(64),
    status: z.enum(HUBSPOT_PROJECT_MAPPING_STATUSES),
    evoProjectId: objectIdSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "mapped" && !value.evoProjectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "evoProjectId is required when status is mapped.",
        path: ["evoProjectId"],
      });
    }
  });

export type HubSpotProjectMappingUpdateInput = z.infer<
  typeof hubspotProjectMappingUpdateSchema
>;
