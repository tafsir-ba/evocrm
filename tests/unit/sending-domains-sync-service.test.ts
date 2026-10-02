import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/campaigns", () => ({
  countCampaignsBySendingDomainId: vi.fn(),
}));

vi.mock("@/server/repositories/sending-domains", () => ({
  findSendingDomainById: vi.fn(),
  findSendingDomainByProviderDomainId: vi.fn(),
  updateSendingDomain: vi.fn(),
  deleteSendingDomain: vi.fn(),
  mapProviderDomainStatus: vi.fn((status: string) =>
    status === "verified" ? "verified" : status === "failed" ? "failed" : "pending",
  ),
}));

vi.mock("@/server/email/resend-domains", () => ({
  getProviderDomain: vi.fn(),
  verifyProviderDomain: vi.fn(),
  deleteProviderDomain: vi.fn(),
  mapProviderDomainToUpdate: vi.fn((providerDomain, options) => ({
    status:
      providerDomain.status === "verified"
        ? "verified"
        : providerDomain.status === "failed"
          ? "failed"
          : "pending",
    dnsRecords: providerDomain.records,
    spfStatus: "pending",
    dkimStatus: "pending",
    dmarcStatus: "missing",
    lastCheckedAt: new Date(),
    verifiedAt:
      providerDomain.status === "verified"
        ? (options?.existingVerifiedAt ?? new Date())
        : null,
  })),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { createAuditLog } from "@/server/audit/create-audit-log";
import {
  getProviderDomain,
  verifyProviderDomain,
} from "@/server/email/resend-domains";
import {
  findSendingDomainById,
  findSendingDomainByProviderDomainId,
  updateSendingDomain,
} from "@/server/repositories/sending-domains";
import {
  refreshSendingDomainForWorkspace,
  syncSendingDomainFromProviderWebhook,
  verifySendingDomainForWorkspace,
} from "@/server/services/sending-domains";

const domainRecord = {
  id: "domain-1",
  workspaceId: "ws-1",
  domain: "example.com",
  provider: "resend" as const,
  providerDomainId: "resend-domain-1",
  status: "pending" as const,
  spfStatus: "pending" as const,
  dkimStatus: "pending" as const,
  dmarcStatus: "missing" as const,
  defaultSenderEmail: "hello@example.com",
  dnsRecords: [],
  lastCheckedAt: new Date(),
  verifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("sending domain status sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refresh uses GET only and never calls verify", async () => {
    vi.mocked(findSendingDomainById).mockResolvedValue(domainRecord);
    vi.mocked(getProviderDomain).mockResolvedValue({
      id: "resend-domain-1",
      name: "example.com",
      status: "verified",
      records: [],
    });
    vi.mocked(updateSendingDomain).mockResolvedValue({
      ...domainRecord,
      status: "verified",
      verifiedAt: new Date(),
    });

    const updated = await refreshSendingDomainForWorkspace("ws-1", "user-1", "domain-1");

    expect(updated.status).toBe("verified");
    expect(getProviderDomain).toHaveBeenCalledWith("resend-domain-1");
    expect(verifyProviderDomain).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sending_domain.refresh" }),
    );
  });

  it("verify triggers provider verify once then persists the polled snapshot", async () => {
    vi.mocked(findSendingDomainById).mockResolvedValue(domainRecord);
    vi.mocked(verifyProviderDomain).mockResolvedValue({
      id: "resend-domain-1",
      name: "example.com",
      status: "verified",
      records: [
        {
          record: "DKIM",
          name: "resend._domainkey",
          type: "TXT",
          value: "p=abc",
          priority: null,
          ttl: null,
          status: "valid",
        },
      ],
    });
    vi.mocked(updateSendingDomain).mockResolvedValue({
      ...domainRecord,
      status: "verified",
      dkimStatus: "valid",
      verifiedAt: new Date(),
    });

    const updated = await verifySendingDomainForWorkspace("ws-1", "user-1", "domain-1");

    expect(updated.status).toBe("verified");
    expect(verifyProviderDomain).toHaveBeenCalledTimes(1);
    expect(verifyProviderDomain).toHaveBeenCalledWith("resend-domain-1");
    expect(getProviderDomain).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sending_domain.verify" }),
    );
  });

  it("webhook sync GETs provider state and persists without calling verify", async () => {
    vi.mocked(findSendingDomainByProviderDomainId).mockResolvedValue(domainRecord);
    vi.mocked(getProviderDomain).mockResolvedValue({
      id: "resend-domain-1",
      name: "example.com",
      status: "failed",
      records: [],
    });
    vi.mocked(updateSendingDomain).mockResolvedValue({
      ...domainRecord,
      status: "failed",
    });

    const updated = await syncSendingDomainFromProviderWebhook("resend-domain-1");

    expect(updated?.status).toBe("failed");
    expect(getProviderDomain).toHaveBeenCalledWith("resend-domain-1");
    expect(verifyProviderDomain).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("webhook sync returns null when provider domain is unknown locally", async () => {
    vi.mocked(findSendingDomainByProviderDomainId).mockResolvedValue(null);

    const updated = await syncSendingDomainFromProviderWebhook("missing-provider-id");

    expect(updated).toBeNull();
    expect(getProviderDomain).not.toHaveBeenCalled();
  });
});
