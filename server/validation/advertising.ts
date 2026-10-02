import { z } from "zod";

export const connectMetaInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  accessToken: z.string().trim().min(1).max(4000).optional(),
  businessId: z.string().trim().min(1).max(120).nullable().optional(),
  useFixture: z.boolean().optional(),
});

export type ConnectMetaInput = z.infer<typeof connectMetaInputSchema>;

export const syncMetaInputSchema = z.object({
  connectionId: z.string().min(1),
  growthCampaignId: z.string().min(1).nullable().optional(),
});

export type SyncMetaInput = z.infer<typeof syncMetaInputSchema>;
