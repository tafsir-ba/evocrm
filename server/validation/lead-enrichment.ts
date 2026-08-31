import { z } from "zod";

import { LEAD_ENRICHMENT_ALLOWED_SOURCES } from "@/lib/lead-enrichment";

export const startLeadEnrichmentSchema = z.object({
  allowedSources: z
    .array(z.enum(LEAD_ENRICHMENT_ALLOWED_SOURCES))
    .min(1)
    .max(LEAD_ENRICHMENT_ALLOWED_SOURCES.length)
    .optional(),
});

export const selectEnrichmentCandidateSchema = z.object({
  candidateId: z.string().trim().min(1).max(80),
});

export const enrichmentDecisionSchema = z.object({
  decisions: z
    .array(
      z.object({
        suggestionId: z.string().trim().min(1).max(80),
        action: z.enum(["accept", "reject", "edit", "clear"]),
        editedValue: z.string().trim().max(500).optional(),
        overwriteAcknowledged: z.boolean().optional(),
      }),
    )
    .max(20),
  summaryAction: z.enum(["accept", "reject"]).optional(),
  summaryEdit: z.string().trim().max(2000).optional(),
});

export const updateLeadEnrichmentSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    demoMode: z.boolean().optional(),
    retentionDays: z.number().int().min(30).max(730).optional(),
    acknowledgeLegalReview: z.literal(true).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export type StartLeadEnrichmentInput = z.infer<typeof startLeadEnrichmentSchema>;
export type SelectEnrichmentCandidateInput = z.infer<typeof selectEnrichmentCandidateSchema>;
export type EnrichmentDecisionInput = z.infer<typeof enrichmentDecisionSchema>;
export type UpdateLeadEnrichmentSettingsInput = z.infer<
  typeof updateLeadEnrichmentSettingsSchema
>;
