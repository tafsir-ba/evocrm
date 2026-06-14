import "server-only";

import { z } from "zod";

import { objectIdSchema } from "@/server/validation/common";

export const reassignRecordsInputSchema = z.object({
  replacementUserId: objectIdSchema,
  newStatus: z.enum(["suspended", "removed"]).optional(),
});

export type ReassignRecordsInput = z.infer<typeof reassignRecordsInputSchema>;
