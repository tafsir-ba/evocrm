import { describe, expect, it } from "vitest";

import {
  formatDnsHostFqdn,
  getDnsParentZone,
  providerIncludesDmarcRecord,
} from "@/lib/sending-domain-dns";

describe("sending domain DNS helpers", () => {
  it("builds the full host name for subdomain sending domains", () => {
    expect(formatDnsHostFqdn("send.crm", "crm.evo-home.ch")).toBe("send.crm.evo-home.ch");
    expect(formatDnsHostFqdn("resend._domainkey.crm", "crm.evo-home.ch")).toBe(
      "resend._domainkey.crm.evo-home.ch",
    );
  });

  it("builds the full host name for apex sending domains", () => {
    expect(getDnsParentZone("example.com")).toBe("example.com");
    expect(formatDnsHostFqdn("resend._domainkey", "example.com")).toBe(
      "resend._domainkey.example.com",
    );
  });

  it("keeps already-qualified host names unchanged", () => {
    expect(formatDnsHostFqdn("send.crm.evo-home.ch", "crm.evo-home.ch")).toBe(
      "send.crm.evo-home.ch",
    );
  });

  it("detects when the provider includes a DMARC record", () => {
    expect(
      providerIncludesDmarcRecord([
        { record: "SPF" },
        { record: "DKIM" },
      ]),
    ).toBe(false);
    expect(providerIncludesDmarcRecord([{ record: "DMARC" }])).toBe(true);
  });
});
