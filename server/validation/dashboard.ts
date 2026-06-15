import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid ID.");

const MAX_DATE_RANGE_DAYS = 366;

export const dashboardQuerySchema = z
  .object({
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    periodDays: z.coerce.number().int().min(1).max(MAX_DATE_RANGE_DAYS).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(25).optional(),
    projectId: objectIdSchema.optional(),
  })
  .superRefine((value, context) => {
    const hasFrom = value.dateFrom !== undefined;
    const hasTo = value.dateTo !== undefined;

    if (hasFrom !== hasTo) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dateFrom and dateTo must be provided together.",
        path: [hasFrom ? "dateTo" : "dateFrom"],
      });
    }

    if (value.periodDays && (hasFrom || hasTo)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use either periodDays or dateFrom/dateTo, not both.",
        path: ["periodDays"],
      });
    }

    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dateFrom must be before or equal to dateTo.",
        path: ["dateFrom"],
      });
    }

    if (value.dateFrom && value.dateTo) {
      const diffMs = value.dateTo.getTime() - value.dateFrom.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > MAX_DATE_RANGE_DAYS) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days.`,
          path: ["dateTo"],
        });
      }
    }
  });

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
