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

type ProviderError = {
  message?: string;
  name?: string;
} | null;

function normalizeDomainName(domain: string): string {
  return domain.toLowerCase().trim();
}

function isAlreadyRegisteredError(error: ProviderError): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("registered already") ||
    message.includes("already been registered") ||
    message.includes("already exists")
  );
}

function mapProviderError(error: ProviderError, fallbackMessage: string): string {
  const message = error?.message?.trim() || fallbackMessage;
  const normalized = message.toLowerCase();
  const errorName = (error?.name ?? "").toLowerCase();

  if (
    errorName.includes("missing_api_key") ||
    errorName.includes("invalid_api_key") ||
    normalized.includes("api key") ||
    normalized.includes("missing api key")
  ) {
    return "Resend API key is missing or invalid. Update RESEND_API_KEY in production and redeploy.";
  }

  if (
    normalized.includes("registered already") ||
    normalized.includes("already been registered")
  ) {
    return "This domain is already registered in another Resend account. Use the correct Resend account or ask Resend support to release the domain.";
  }

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

  if (normalized.includes("rate limit")) {
    return "Resend is rate-limiting domain requests right now. Please wait a moment and try again.";
  }

  return `Resend rejected this request: ${message}`;
}

export async function createProviderDomain(domain: string): Promise<ProviderDomain> {
  const resend = getResendClient();
  const normalizedDomain = normalizeDomainName(domain);
  const result = await resend.domains.create({ name: normalizedDomain });

  if ((result.error || !result.data) && isAlreadyRegisteredError(result.error)) {
    const listResult = await resend.domains.list();
    const existingDomain = listResult.error
      ? null
      : (listResult.data?.data ?? []).find(
          (providerDomain) => normalizeDomainName(providerDomain.name) === normalizedDomain,
        );

    if (existingDomain) {
      return getProviderDomain(existingDomain.id);
    }
  }

  if (result.error || !result.data) {
    throw new AppError(
      "VALIDATION_ERROR",
      mapProviderError(result.error, "Could not add this domain."),
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
      mapProviderError(result.error, "This sending domain could not be found."),
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
      mapProviderError(verifyResult.error, "Could not verify this domain yet."),
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
      mapProviderError(result.error, "Could not remove this domain."),
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
