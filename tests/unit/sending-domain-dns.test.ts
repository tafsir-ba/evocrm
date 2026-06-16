import { describe, expect, it } from "vitest";

import { formatDnsHostFqdn } from "@/lib/sending-domain-dns";

describe("sending domain DNS helpers", () => {
  it("builds the full host name for subdomain sending domains", () => {
    expect(formatDnsHostFqdn("send.crm", "crm.evo-home.ch")).toBe("send.crm.evo-home.ch");
    expect(formatDnsHostFqdn("resend._domainkey.crm", "crm.evo-home.ch")).toBe(
      "resend._domainkey.crm.evo-home.ch",
    );
  });

  it("keeps already-qualified host names unchanged", () => {
    expect(formatDnsHostFqdn("send.crm.evo-home.ch", "crm.evo-home.ch")).toBe(
      "send.crm.evo-home.ch",
    );
  });
});
