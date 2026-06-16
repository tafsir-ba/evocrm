import { describe, expect, it } from "vitest";

import { deriveDomainHealth } from "@/server/repositories/sending-domains";

describe("sending domain repository health", () => {
  it("derives SPF and DKIM status from provider DNS records", () => {
    const health = deriveDomainHealth([
      {
        record: "DKIM",
        name: "resend._domainkey.crm",
        type: "TXT",
        value: "p=abc",
        priority: null,
        ttl: null,
        status: "valid",
      },
      {
        record: "SPF",
        name: "send.crm",
        type: "TXT",
        value: "v=spf1 include:amazonses.com ~all",
        priority: null,
        ttl: null,
        status: "pending",
      },
    ]);

    expect(health.dkimStatus).toBe("valid");
    expect(health.spfStatus).toBe("pending");
    expect(health.dmarcStatus).toBe("missing");
  });
});
