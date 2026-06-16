import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteSendingDomainForWorkspace,
  updateSendingDomainSettingsForWorkspace,
} from "@/server/services/sending-domains";
import { updateSendingDomainInputSchema } from "@/server/validation/sending-domains";

vi.mock("@/server/repositories/campaigns", () => ({
  countCampaignsBySendingDomainId: vi.fn(),
}));

vi.mock("@/server/repositories/sending-domains", () => ({
  findSendingDomainById: vi.fn(),
  updateSendingDomain: vi.fn(),
  deleteSendingDomain: vi.fn(),
}));

vi.mock("@/server/email/resend-domains", () => ({
  deleteProviderDomain: vi.fn(),
}));

vi.mock("@/server/audit/create-audit-log", () => ({
  createAuditLog: vi.fn(),
}));

import { countCampaignsBySendingDomainId } from "@/server/repositories/campaigns";
import {
  deleteSendingDomain,
  findSendingDomainById,
  updateSendingDomain,
} from "@/server/repositories/sending-domains";
import { deleteProviderDomain } from "@/server/email/resend-domains";

const domainRecord = {
  id: "domain-1",
  workspaceId: "ws-1",
  domain: "example.com",
  provider: "resend" as const,
  providerDomainId: "resend-domain-1",
  status: "verified" as const,
  spfStatus: "valid" as const,
  dkimStatus: "valid" as const,
  dmarcStatus: "valid" as const,
  defaultSenderEmail: "hello@example.com",
  dnsRecords: [],
  lastCheckedAt: new Date(),
  verifiedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("sending domain service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty PATCH payloads at the schema layer", () => {
    const result = updateSendingDomainInputSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("updates default sender email when it matches the domain", async () => {
    vi.mocked(findSendingDomainById).mockResolvedValue(domainRecord);
    vi.mocked(updateSendingDomain).mockResolvedValue({
      ...domainRecord,
      defaultSenderEmail: "sales@example.com",
    });

    const updated = await updateSendingDomainSettingsForWorkspace(
      "ws-1",
      "user-1",
      "domain-1",
      { defaultSenderEmail: "sales@example.com" },
    );

    expect(updated.defaultSenderEmail).toBe("sales@example.com");
    expect(updateSendingDomain).toHaveBeenCalledWith("ws-1", "domain-1", {
      defaultSenderEmail: "sales@example.com",
    });
  });

  it("blocks delete when active campaigns still reference the domain", async () => {
    vi.mocked(findSendingDomainById).mockResolvedValue(domainRecord);
    vi.mocked(countCampaignsBySendingDomainId).mockResolvedValue(2);

    await expect(
      deleteSendingDomainForWorkspace("ws-1", "user-1", "domain-1"),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("2 campaigns"),
    });

    expect(deleteProviderDomain).not.toHaveBeenCalled();
    expect(deleteSendingDomain).not.toHaveBeenCalled();
  });

  it("deletes the domain when no campaigns reference it", async () => {
    vi.mocked(findSendingDomainById).mockResolvedValue(domainRecord);
    vi.mocked(countCampaignsBySendingDomainId).mockResolvedValue(0);
    vi.mocked(deleteProviderDomain).mockResolvedValue(undefined);
    vi.mocked(deleteSendingDomain).mockResolvedValue(true);

    await deleteSendingDomainForWorkspace("ws-1", "user-1", "domain-1");

    expect(deleteProviderDomain).toHaveBeenCalledWith("resend-domain-1");
    expect(deleteSendingDomain).toHaveBeenCalledWith("ws-1", "domain-1");
  });
});
