import { describe, expect, it } from "vitest";

import {
  ACTIVITY_STATUS_BEHAVIORS,
  OPPORTUNITY_STATUS_BEHAVIORS,
  dictionaryTypeRequiresBehavior,
  slugifyDictionaryKey,
} from "@/lib/dictionary-form-helpers";

describe("dictionary form helpers", () => {
  it("requires behavior only for opportunity and activity status types", () => {
    expect(dictionaryTypeRequiresBehavior("opportunity_status")).toBe(true);
    expect(dictionaryTypeRequiresBehavior("activity_status")).toBe(true);
    expect(dictionaryTypeRequiresBehavior("lead_status")).toBe(false);
    expect(dictionaryTypeRequiresBehavior("lead_source")).toBe(false);
  });

  it("slugifies labels into stable keys", () => {
    expect(slugifyDictionaryKey("Hot Lead")).toBe("hot_lead");
    expect(slugifyDictionaryKey("Google Ads")).toBe("google_ads");
  });

  it("exports behavior allowlists for UI selects", () => {
    expect(OPPORTUNITY_STATUS_BEHAVIORS).toContain("terminal_won");
    expect(ACTIVITY_STATUS_BEHAVIORS).toContain("completed");
  });
});
