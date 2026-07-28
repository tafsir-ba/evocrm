import { describe, expect, it } from "vitest";

import {
  formatLeadUtmSummary,
  readLeadIntegrationAttributes,
} from "@/lib/lead-integration-attributes";

describe("lead integration attributes helper", () => {
  it("reads nested integration attribution fields", () => {
    const attrs = readLeadIntegrationAttributes({
      integration: {
        integrationId: "int-1",
        inboundSource: "hero-form",
        utm: { campaign: "spring", source: "google" },
      },
    });

    expect(attrs).toEqual({
      integrationId: "int-1",
      inboundSource: "hero-form",
      utm: { campaign: "spring", source: "google" },
    });
    expect(formatLeadUtmSummary(attrs?.utm)).toContain("campaign: spring");
  });

  it("returns null when integration metadata is absent", () => {
    expect(readLeadIntegrationAttributes({})).toBeNull();
    expect(formatLeadUtmSummary(undefined)).toBe("—");
  });
});
