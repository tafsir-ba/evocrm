import "server-only";

import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

const activityViewSchema = z.enum(["all", "mine", "upcoming", "overdue"]);

export const activityListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  search: z.string().trim().max(120).optional(),
  projectId: objectIdSchema.optional(),
  typeId: objectIdSchema.optional(),
  statusId: objectIdSchema.optional(),
  assignedTo: objectIdSchema.optional(),
  ownerId: objectIdSchema.optional(),
  leadId: objectIdSchema.optional(),
  propertyId: objectIdSchema.optional(),
  opportunityId: objectIdSchema.optional(),
  view: activityViewSchema.optional(),
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  completedFrom: z.coerce.date().optional(),
  completedTo: z.coerce.date().optional(),
});

const relationshipFieldsSchema = z.object({
  opportunityId: objectIdSchema.optional(),
  leadId: objectIdSchema.optional(),
  propertyId: objectIdSchema.optional(),
});

function hasAtLeastOneRelationship(
  value: z.infer<typeof relationshipFieldsSchema> & { projectId?: string },
): boolean {
  return Boolean(value.opportunityId || value.leadId || value.propertyId || value.projectId);
}

export const createActivityInputSchema = z
  .object({
    projectId: objectIdSchema.optional(),
    opportunityId: objectIdSchema.optional(),
    leadId: objectIdSchema.optional(),
    propertyId: objectIdSchema.optional(),
    typeId: objectIdSchema,
    statusId: objectIdSchema,
    ownerId: objectIdSchema.optional(),
    assignedTo: objectIdSchema.optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    dueDate: z.coerce.date().optional(),
    outcome: z.string().trim().max(2000).optional(),
    nextActionDate: z.coerce.date().optional(),
  })
  .strict()
  .refine(hasAtLeastOneRelationship, {
    message: "At least one of opportunityId, leadId, propertyId, or projectId is required.",
  });

export const updateActivityInputSchema = z
  .object({
    opportunityId: objectIdSchema.nullable().optional(),
    leadId: objectIdSchema.nullable().optional(),
    propertyId: objectIdSchema.nullable().optional(),
    typeId: objectIdSchema.optional(),
    statusId: objectIdSchema.optional(),
    ownerId: objectIdSchema.nullable().optional(),
    assignedTo: objectIdSchema.nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    outcome: z.string().trim().max(2000).nullable().optional(),
    nextActionDate: z.coerce.date().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  })
  .refine(
    (value) => {
      if (
        value.opportunityId === undefined &&
        value.leadId === undefined &&
        value.propertyId === undefined
      ) {
        return true;
      }

      const opportunityId =
        value.opportunityId === undefined ? undefined : value.opportunityId;
      const leadId = value.leadId === undefined ? undefined : value.leadId;
      const propertyId =
        value.propertyId === undefined ? undefined : value.propertyId;

      return Boolean(opportunityId || leadId || propertyId);
    },
    {
      message: "At least one of opportunityId, leadId, or propertyId is required.",
    },
  );

export const completeActivityInputSchema = z
  .object({
    outcome: z.string().trim().max(2000).optional(),
    nextActionDate: z.coerce.date().optional(),
  })
  .strict();

export const cancelActivityInputSchema = z
  .object({
    outcome: z.string().trim().max(2000).optional(),
  })
  .strict();

export type CreateActivityInput = z.infer<typeof createActivityInputSchema>;
export type UpdateActivityInput = z.infer<typeof updateActivityInputSchema>;
export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
export type CompleteActivityInput = z.infer<typeof completeActivityInputSchema>;
export type CancelActivityInput = z.infer<typeof cancelActivityInputSchema>;
