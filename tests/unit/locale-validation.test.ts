import { describe, expect, it } from "vitest";

import {
  CURRENCY_CODES,
  isAllowedCurrency,
  isSupportedCurrency,
  isSupportedTimezone,
  isValidIanaTimezone,
  TIMEZONE_IDS,
} from "@/lib/locale-options";
import {
  supportedCurrencySchema,
  supportedTimezoneSchema,
} from "@/server/validation/locale";
import { updateWorkspaceSettingsSchema } from "@/server/validation/workspace-settings";
import { createWorkspaceInputSchema } from "@/server/services/workspaces";

describe("locale options", () => {
  it("accepts supported currency codes", () => {
    expect(isAllowedCurrency("chf")).toBe(true);
    expect(isSupportedCurrency("CHF")).toBe(true);
    expect(CURRENCY_CODES).toContain("CHF");
  });

  it("rejects unsupported currency codes", () => {
    expect(isAllowedCurrency("ZZZ")).toBe(false);
    expect(isSupportedCurrency("ZZZ")).toBe(false);
  });

  it("accepts supported timezone ids", () => {
    expect(isSupportedTimezone("Europe/Zurich")).toBe(true);
    expect(TIMEZONE_IDS).toContain("Europe/Zurich");
    expect(isValidIanaTimezone("Europe/Zurich")).toBe(true);
  });

  it("rejects invalid timezone ids", () => {
    expect(isSupportedTimezone("GMT+2")).toBe(false);
    expect(isValidIanaTimezone("GMT+2")).toBe(false);
  });
});

describe("locale validation schemas", () => {
  it("accepts supported workspace settings values", () => {
    const result = updateWorkspaceSettingsSchema.safeParse({
      timezone: "Europe/Zurich",
      defaultCurrency: "CHF",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported workspace currency", () => {
    const result = updateWorkspaceSettingsSchema.safeParse({
      defaultCurrency: "ZZZ",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsupported workspace timezone", () => {
    const result = updateWorkspaceSettingsSchema.safeParse({
      timezone: "GMT+2",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsupported currencies on workspace create", () => {
    const result = createWorkspaceInputSchema.safeParse({
      name: "Demo",
      defaultCurrency: "ZZZ",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid timezone on workspace create", () => {
    const result = createWorkspaceInputSchema.safeParse({
      name: "Demo",
      timezone: "Not/A_Real_Zone",
    });

    expect(result.success).toBe(false);
  });

  it("validates enum schemas directly", () => {
    expect(supportedCurrencySchema.safeParse("EUR").success).toBe(true);
    expect(supportedTimezoneSchema.safeParse("UTC").success).toBe(true);
    expect(supportedCurrencySchema.safeParse("ABC").success).toBe(false);
    expect(supportedTimezoneSchema.safeParse("GMT+2").success).toBe(false);
  });
});
