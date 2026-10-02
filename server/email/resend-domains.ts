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

const IMPORTABLE_PROVIDER_STATUSES = new Set([
  "pending",
  "verified",
  "not_started",
  "temporary_failure",
]);

function isOtherAccountRegistrationError(error: ProviderError): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("registered already") ||
    message.includes("already been registered")
  );
}

function shouldAttemptProviderImport(error: ProviderError): boolean {
  if (!error || (error.name ?? "").toLowerCase() !== "validation_error") {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";
  return (
    isOtherAccountRegistrationError(error) ||
    message.includes("already exists") ||
    message.includes("domain already")
  );
}

function isImportableProviderStatus(status: string): boolean {
  return IMPORTABLE_PROVIDER_STATUSES.has(status);
}

function mapProviderError(error: ProviderError, fallbackMessage: string): string {
  const message = error?.message?.trim() || fallbackMessage;
  const normalized = message.toLowerCase();
  const errorName = (error?.name ?? "").toLowerCase();

  if (errorName === "missing_api_key" || errorName === "invalid_api_key") {
    return "Resend API key is missing or invalid. Update RESEND_API_KEY in production and redeploy.";
  }

  if (errorName === "rate_limit_exceeded" || normalized.includes("rate limit")) {
    return "Resend is rate-limiting domain requests right now. Please wait a moment and try again.";
  }

  if (errorName === "not_found" || normalized.includes("not found")) {
    return "This sending domain could not be found. Please remove it and add it again.";
  }

  if (errorName === "validation_error" && isOtherAccountRegistrationError(error)) {
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

  if (normalized.includes("api key") || normalized.includes("missing api key")) {
    return "Resend API key is missing or invalid. Update RESEND_API_KEY in production and redeploy.";
  }

  return `Could not complete this domain action: ${message}`;
}

function providerAppError(
  error: ProviderError,
  fallbackMessage: string,
  fallbackCode: "VALIDATION_ERROR" | "NOT_FOUND" = "VALIDATION_ERROR",
): AppError {
  const message = mapProviderError(error, fallbackMessage);
  const errorName = (error?.name ?? "").toLowerCase();
  const normalized = (error?.message ?? "").toLowerCase();

  if (errorName === "rate_limit_exceeded" || normalized.includes("rate limit")) {
    return new AppError("RATE_LIMITED", message);
  }

  if (errorName === "not_found" || normalized.includes("not found")) {
    return new AppError("NOT_FOUND", message);
  }

  if (errorName === "missing_api_key" || errorName === "invalid_api_key") {
    return new AppError("INTERNAL_ERROR", message, { expose: true });
  }

  return new AppError(fallbackCode, message);
}

export async function createProviderDomain(domain: string): Promise<ProviderDomain> {
  const resend = getResendClient();
  const normalizedDomain = normalizeDomainName(domain);
  const result = await resend.domains.create({ name: normalizedDomain });

  if ((result.error || !result.data) && shouldAttemptProviderImport(result.error)) {
    const listResult = await resend.domains.list();
    const existingDomain = listResult.error
      ? null
      : (listResult.data?.data ?? []).find(
          (providerDomain) => normalizeDomainName(providerDomain.name) === normalizedDomain,
        );

    if (existingDomain) {
      if (!isImportableProviderStatus(existingDomain.status)) {
        throw new AppError(
          "VALIDATION_ERROR",
          "This domain exists in Resend but verification failed. Fix the DNS records in Resend, then try again.",
        );
      }

      return getProviderDomain(existingDomain.id);
    }

    if (isOtherAccountRegistrationError(result.error)) {
      throw new AppError(
        "VALIDATION_ERROR",
        mapProviderError(result.error, "Could not add this domain."),
      );
    }
  }

  if (result.error || !result.data) {
    throw providerAppError(result.error, "Could not add this domain.");
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
    throw providerAppError(
      result.error,
      "This sending domain could not be found.",
      "NOT_FOUND",
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Overall Resend statuses that mean verify has finished (success or failure). */
export function isTerminalProviderDomainStatus(status: string): boolean {
  const normalized = status.toLowerCase().trim();
  return (
    normalized === "verified" ||
    normalized === "failed" ||
    normalized === "failure" ||
    normalized === "partially_failed"
  );
}

export function isFailedProviderDomainStatus(status: string): boolean {
  const normalized = status.toLowerCase().trim();
  return (
    normalized === "failed" ||
    normalized === "failure" ||
    normalized === "partially_failed"
  );
}

export type PollProviderDomainOptions = {
  /** Total GETs including the initial one. Default: delays.length + 1. */
  maxAttempts?: number;
  /** Backoff between GETs (ms). Default: 1s, 2s, 3s, 5s, 8s. */
  delaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  getDomain?: (providerDomainId: string) => Promise<ProviderDomain>;
  /**
   * After a freshly triggered domains.verify, Resend may briefly return the
   * prior failed snapshot. When true, failure on the first GET is not treated
   * as terminal — at least one delayed GET is required.
   */
  ignoreInitialFailure?: boolean;
};

/**
 * Poll Resend GET /domains/:id until overall status is terminal, or attempts are exhausted.
 * Never calls domains.verify — safe for refresh / post-verify follow-up / webhooks.
 */
export async function pollProviderDomainUntilSettled(
  providerDomainId: string,
  options?: PollProviderDomainOptions,
): Promise<ProviderDomain> {
  const getDomain = options?.getDomain ?? getProviderDomain;
  const sleepFn = options?.sleep ?? sleep;
  const delaysMs = options?.delaysMs ?? [1000, 2000, 3000, 5000, 8000];
  const ignoreInitialFailure = options?.ignoreInitialFailure === true;
  const maxAttempts = Math.max(
    ignoreInitialFailure ? 2 : 1,
    options?.maxAttempts ?? delaysMs.length + 1,
  );

  let latest = await getDomain(providerDomainId);
  const initialIsStaleFailure =
    ignoreInitialFailure && isFailedProviderDomainStatus(latest.status);

  if (isTerminalProviderDomainStatus(latest.status) && !initialIsStaleFailure) {
    return latest;
  }

  for (let attempt = 0; attempt < maxAttempts - 1; attempt += 1) {
    const delay = delaysMs[Math.min(attempt, delaysMs.length - 1)] ?? 1000;
    await sleepFn(delay);
    latest = await getDomain(providerDomainId);
    if (isTerminalProviderDomainStatus(latest.status)) {
      return latest;
    }
  }

  return latest;
}

/**
 * Trigger Resend domain verification once, then poll GET until terminal (or timeout).
 * Only this path may call domains.verify.
 */
export async function verifyProviderDomain(
  providerDomainId: string,
  pollOptions?: PollProviderDomainOptions,
): Promise<ProviderDomain> {
  const resend = getResendClient();
  const verifyResult = await resend.domains.verify(providerDomainId);

  if (verifyResult.error) {
    throw providerAppError(verifyResult.error, "Could not verify this domain yet.");
  }

  // Always ignore a failed snapshot on the first post-verify GET — it can be
  // the pre-trigger state before Resend flips to pending / verified.
  return pollProviderDomainUntilSettled(providerDomainId, {
    ...pollOptions,
    ignoreInitialFailure: true,
  });
}

export async function deleteProviderDomain(providerDomainId: string): Promise<void> {
  const resend = getResendClient();
  const result = await resend.domains.remove(providerDomainId);

  if (result.error) {
    throw providerAppError(result.error, "Could not remove this domain.");
  }
}

export function mapProviderDomainToUpdate(
  providerDomain: ProviderDomain,
  options?: { existingVerifiedAt?: Date | null },
) {
  const health = deriveDomainHealth(providerDomain.records);
  const nextStatus = mapProviderDomainStatus(providerDomain.status);

  return {
    status: nextStatus,
    dnsRecords: providerDomain.records,
    spfStatus: health.spfStatus,
    dkimStatus: health.dkimStatus,
    dmarcStatus: health.dmarcStatus,
    lastCheckedAt: new Date(),
    verifiedAt:
      nextStatus === "verified" ? (options?.existingVerifiedAt ?? new Date()) : null,
  };
}
