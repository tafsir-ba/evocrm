import "server-only";

import { z } from "zod";

export const companyListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
});

export const createCompanyInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    website: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

export type CreateCompanyInput = z.infer<typeof createCompanyInputSchema>;
