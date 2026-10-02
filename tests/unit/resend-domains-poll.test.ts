import { describe, expect, it, vi } from "vitest";

import {
  isTerminalProviderDomainStatus,
  pollProviderDomainUntilSettled,
  type ProviderDomain,
} from "@/server/email/resend-domains";

function providerDomain(
  status: string,
  records: ProviderDomain["records"] = [],
): ProviderDomain {
  return {
    id: "resend-domain-1",
    name: "example.com",
    status,
    records,
  };
}

describe("pollProviderDomainUntilSettled", () => {
  it("treats verified and failed as terminal", () => {
    expect(isTerminalProviderDomainStatus("verified")).toBe(true);
    expect(isTerminalProviderDomainStatus("failed")).toBe(true);
    expect(isTerminalProviderDomainStatus("failure")).toBe(true);
    expect(isTerminalProviderDomainStatus("pending")).toBe(false);
    expect(isTerminalProviderDomainStatus("not_started")).toBe(false);
  });

  it("returns immediately when the first GET is already verified", async () => {
    const getDomain = vi.fn().mockResolvedValue(providerDomain("verified"));
    const sleep = vi.fn();

    const result = await pollProviderDomainUntilSettled("resend-domain-1", {
      getDomain,
      sleep,
      delaysMs: [10, 20],
    });

    expect(result.status).toBe("verified");
    expect(getDomain).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("polls GET until pending becomes verified", async () => {
    const getDomain = vi
      .fn()
      .mockResolvedValueOnce(
        providerDomain("pending", [
          {
            record: "DKIM",
            name: "resend._domainkey",
            type: "TXT",
            value: "p=abc",
            priority: null,
            ttl: null,
            status: "pending",
          },
        ]),
      )
      .mockResolvedValueOnce(
        providerDomain("pending", [
          {
            record: "DKIM",
            name: "resend._domainkey",
            type: "TXT",
            value: "p=abc",
            priority: null,
            ttl: null,
            status: "valid",
          },
        ]),
      )
      .mockResolvedValueOnce(
        providerDomain("verified", [
          {
            record: "DKIM",
            name: "resend._domainkey",
            type: "TXT",
            value: "p=abc",
            priority: null,
            ttl: null,
            status: "valid",
          },
          {
            record: "SPF",
            name: "send",
            type: "TXT",
            value: "v=spf1 include:amazonses.com ~all",
            priority: null,
            ttl: null,
            status: "valid",
          },
        ]),
      );
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await pollProviderDomainUntilSettled("resend-domain-1", {
      getDomain,
      sleep,
      delaysMs: [1, 1, 1],
      maxAttempts: 4,
    });

    expect(result.status).toBe("verified");
    expect(result.records.find((r) => r.record === "DKIM")?.status).toBe("valid");
    expect(result.records.find((r) => r.record === "SPF")?.status).toBe("valid");
    expect(getDomain).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("polls GET until pending becomes failed", async () => {
    const getDomain = vi
      .fn()
      .mockResolvedValueOnce(providerDomain("pending"))
      .mockResolvedValueOnce(providerDomain("failed"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await pollProviderDomainUntilSettled("resend-domain-1", {
      getDomain,
      sleep,
      delaysMs: [1],
      maxAttempts: 3,
    });

    expect(result.status).toBe("failed");
    expect(getDomain).toHaveBeenCalledTimes(2);
  });

  it("returns the last snapshot when attempts are exhausted while still pending", async () => {
    const getDomain = vi.fn().mockResolvedValue(providerDomain("pending"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await pollProviderDomainUntilSettled("resend-domain-1", {
      getDomain,
      sleep,
      delaysMs: [1, 1],
      maxAttempts: 3,
    });

    expect(result.status).toBe("pending");
    expect(getDomain).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("after a new verify, ignores repeated failed GETs until pending then verified", async () => {
    const getDomain = vi
      .fn()
      .mockResolvedValueOnce(providerDomain("failed"))
      .mockResolvedValueOnce(providerDomain("failed"))
      .mockResolvedValueOnce(providerDomain("pending"))
      .mockResolvedValueOnce(providerDomain("verified"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await pollProviderDomainUntilSettled("resend-domain-1", {
      getDomain,
      sleep,
      delaysMs: [1, 1, 1],
      maxAttempts: 5,
      ignoreStaleFailureUntilTransition: true,
    });

    expect(result.status).toBe("verified");
    expect(getDomain).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it("after a new verify, still accepts failed once provider left and returned to failed", async () => {
    const getDomain = vi
      .fn()
      .mockResolvedValueOnce(providerDomain("failed"))
      .mockResolvedValueOnce(providerDomain("pending"))
      .mockResolvedValueOnce(providerDomain("failed"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await pollProviderDomainUntilSettled("resend-domain-1", {
      getDomain,
      sleep,
      delaysMs: [1, 1],
      maxAttempts: 4,
      ignoreStaleFailureUntilTransition: true,
    });

    expect(result.status).toBe("failed");
    expect(getDomain).toHaveBeenCalledTimes(3);
  });

  it("after a new verify, returns last failed when retries expire without transition", async () => {
    const getDomain = vi.fn().mockResolvedValue(providerDomain("failed"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await pollProviderDomainUntilSettled("resend-domain-1", {
      getDomain,
      sleep,
      delaysMs: [1, 1],
      maxAttempts: 3,
      ignoreStaleFailureUntilTransition: true,
    });

    expect(result.status).toBe("failed");
    expect(getDomain).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("without ignoreStaleFailureUntilTransition, still stops on the first failed GET", async () => {
    const getDomain = vi.fn().mockResolvedValue(providerDomain("failed"));
    const sleep = vi.fn();

    const result = await pollProviderDomainUntilSettled("resend-domain-1", {
      getDomain,
      sleep,
      delaysMs: [1],
    });

    expect(result.status).toBe("failed");
    expect(getDomain).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
