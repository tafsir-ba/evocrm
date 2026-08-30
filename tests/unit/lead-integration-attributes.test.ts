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

  it("reads inbound receivedAt and HubSpot createdate as sourceCreatedAt", () => {
    expect(
      readLeadIntegrationAttributes({
        integration: {
          receivedAt: "2026-08-28T12:00:00.000Z",
          createdate: "2026-07-01T00:00:00.000Z",
        },
      }),
    ).toEqual({
      receivedAt: "2026-08-28T12:00:00.000Z",
      sourceCreatedAt: "2026-07-01T00:00:00.000Z",
    });
  });
});
