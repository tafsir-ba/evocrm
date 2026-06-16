import "server-only";

import { Resend } from "resend";

import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import {
  buildDnsRecordsFromProvider,
  deriveDomainHealth,
  mapProviderDomainStatus,
  type DnsRecord,
} from "@/server/repositories/sending-domains";

export type ProviderDomain = {
  id: string;
  name: string;
  status: string;
  records: DnsRecord[];
};

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  const env = getEnv();

  if (!env.RESEND_API_KEY) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Email sending is not configured.",
      { expose: false },
    );
  }

  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }

  return resendClient;
}

function mapProviderError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("not verified") || normalized.includes("domain_not_verified")) {
    return "This domain is not verified yet. Please make sure all DNS records were added correctly.";
  }

  if (normalized.includes("dkim")) {
    return "Your DKIM record is missing or still pending. Add the DKIM record shown below to your DNS settings.";
  }

  if (normalized.includes("spf")) {
    return "Your SPF record does not match the required value. Please update it exactly as shown.";
  }

  if (normalized.includes("not found")) {
    return "This sending domain could not be found. Please remove it and add it again.";
  }

  return "We could not complete this domain action. Please try again.";
}

export async function createProviderDomain(domain: string): Promise<ProviderDomain> {
  const resend = getResendClient();
  const result = await resend.domains.create({ name: domain.toLowerCase().trim() });

  if (result.error || !result.data) {
    throw new AppError(
      "VALIDATION_ERROR",
      mapProviderError(result.error?.message ?? "Could not add this domain."),
    );
  }

  const records = buildDnsRecordsFromProvider(
    (result.data.records ?? []).map((record) => ({
      record: record.record,
      name: record.name,
      type: record.type,
      value: record.value,
      priority: record.priority,
      ttl: record.ttl,
      status: record.status,
    })),
  );

  return {
    id: result.data.id,
    name: result.data.name,
    status: result.data.status,
    records,
  };
}

export async function getProviderDomain(providerDomainId: string): Promise<ProviderDomain> {
  const resend = getResendClient();
  const result = await resend.domains.get(providerDomainId);

  if (result.error || !result.data) {
    throw new AppError(
      "NOT_FOUND",
      mapProviderError(result.error?.message ?? "This sending domain could not be found."),
    );
  }

  const records = buildDnsRecordsFromProvider(
    (result.data.records ?? []).map((record) => ({
      record: record.record,
      name: record.name,
      type: record.type,
      value: record.value,
      priority: record.priority,
      ttl: record.ttl,
      status: record.status,
    })),
  );

  return {
    id: result.data.id,
    name: result.data.name,
    status: result.data.status,
    records,
  };
}

export async function verifyProviderDomain(providerDomainId: string): Promise<ProviderDomain> {
  const resend = getResendClient();
  const verifyResult = await resend.domains.verify(providerDomainId);

  if (verifyResult.error) {
    throw new AppError(
      "VALIDATION_ERROR",
      mapProviderError(verifyResult.error.message ?? "Could not verify this domain yet."),
    );
  }

  return getProviderDomain(providerDomainId);
}

export async function deleteProviderDomain(providerDomainId: string): Promise<void> {
  const resend = getResendClient();
  const result = await resend.domains.remove(providerDomainId);

  if (result.error) {
    throw new AppError(
      "VALIDATION_ERROR",
      mapProviderError(result.error.message ?? "Could not remove this domain."),
    );
  }
}

export function mapProviderDomainToUpdate(providerDomain: ProviderDomain) {
  const health = deriveDomainHealth(providerDomain.records);

  return {
    status: mapProviderDomainStatus(providerDomain.status),
    dnsRecords: providerDomain.records,
    spfStatus: health.spfStatus,
    dkimStatus: health.dkimStatus,
    dmarcStatus: health.dmarcStatus,
    lastCheckedAt: new Date(),
    verifiedAt:
      mapProviderDomainStatus(providerDomain.status) === "verified" ? new Date() : null,
  };
}
