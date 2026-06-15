import "server-only";

import { z } from "zod";

export const deleteWorkspaceInputSchema = z.object({
  confirmName: z.string().trim().min(1).max(120),
});

export type DeleteWorkspaceInput = z.infer<typeof deleteWorkspaceInputSchema>;
