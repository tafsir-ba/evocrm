import "server-only";

import { z } from "zod";

import { CURRENCY_CODES, TIMEZONE_IDS } from "@/lib/locale-options";

export const supportedCurrencySchema = z.enum(CURRENCY_CODES, {
  message: "Select a supported currency.",
});

export const supportedTimezoneSchema = z.enum(TIMEZONE_IDS, {
  message: "Select a supported time zone.",
});

export type SupportedCurrency = z.infer<typeof supportedCurrencySchema>;
export type SupportedTimezone = z.infer<typeof supportedTimezoneSchema>;
