import { z } from "zod";

import {
  FINANCIAL_CONFIDENCE_LEVELS,
  FINANCIAL_EMPLOYMENT_TYPES,
  FINANCIAL_SITUATION_SOURCES,
} from "@/lib/lead-financial-situation";
import { supportedCurrencySchema } from "@/server/validation/locale";

const moneySchema = z.number().finite().min(0).max(1_000_000_000).nullable();

export const updateFinancialSituationSchema = z.object({
  declaredAnnualIncome: moneySchema.optional(),
  employmentType: z.enum(FINANCIAL_EMPLOYMENT_TYPES).nullable().optional(),
  availableDepositEquity: moneySchema.optional(),
  targetPurchasePrice: moneySchema.optional(),
  financingNeed: moneySchema.optional(),
  existingCommitments: z.string().trim().max(2000).nullable().optional(),
  affordabilityNotes: z.string().trim().max(4000).nullable().optional(),
  currency: supportedCurrencySchema.optional(),
  source: z.enum(FINANCIAL_SITUATION_SOURCES).nullable().optional(),
  asOfDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .nullable()
    .optional(),
  confidence: z.enum(FINANCIAL_CONFIDENCE_LEVELS).nullable().optional(),
  assessorNotes: z.string().trim().max(4000).nullable().optional(),
});

export type UpdateFinancialSituationInput = z.infer<typeof updateFinancialSituationSchema>;
