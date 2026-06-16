import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import {
  createProviderDomain,
  deleteProviderDomain,
  getProviderDomain,
  mapProviderDomainToUpdate,
  verifyProviderDomain,
} from "@/server/email/resend-domains";
import { countCampaignsBySendingDomainId } from "@/server/repositories/campaigns";
import {
  createSendingDomain,
  deleteSendingDomain,
  findSendingDomainById,
  findSendingDomainByName,
  findSendingDomains,
  mapProviderDomainStatus,
  updateSendingDomain,
  type SendingDomainRecord,
} from "@/server/repositories/sending-domains";
import type {
  CreateSendingDomainInput,
  UpdateSendingDomainInput,
} from "@/server/validation/sending-domains";

function domainSnapshot(domain: SendingDomainRecord): Record<string, unknown> {
  return {
    id: domain.id,
    domain: domain.domain,
    status: domain.status,
    defaultSenderEmail: domain.defaultSenderEmail,
  };
}

function assertSenderEmailOnDomain(email: string, domain: string): void {
  const normalizedEmail = email.toLowerCase().trim();
  const suffix = `@${domain.toLowerCase().trim()}`;

  if (!normalizedEmail.endsWith(suffix)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Sender email must use the @${domain} domain.`,
    );
  }
}

export async function listSendingDomainsForWorkspace(
  workspaceId: string,
): Promise<SendingDomainRecord[]> {
  return findSendingDomains(workspaceId);
}

export async function getSendingDomainForWorkspace(
  workspaceId: string,
  domainId: string,
): Promise<SendingDomainRecord> {
  const domain = await findSendingDomainById(workspaceId, domainId);

  if (!domain) {
    throw new AppError("NOT_FOUND", "Sending domain not found.");
  }

  return domain;
}

export async function createSendingDomainForWorkspace(
  workspaceId: string,
  userId: string,
  input: CreateSendingDomainInput,
): Promise<SendingDomainRecord> {
  const existing = await findSendingDomainByName(workspaceId, input.domain);

  if (existing) {
    throw new AppError("CONFLICT", "This domain is already added to this workspace.");
  }

  const providerDomain = await createProviderDomain(input.domain);
  const defaultSenderEmail =
    input.defaultSenderEmail?.toLowerCase().trim() ??
    `hello@${providerDomain.name.toLowerCase()}`;

  assertSenderEmailOnDomain(defaultSenderEmail, providerDomain.name);

  const domain = await createSendingDomain(workspaceId, {
    domain: providerDomain.name,
    provider: "resend",
    providerDomainId: providerDomain.id,
    status: mapProviderDomainStatus(providerDomain.status),
    dnsRecords: providerDomain.records,
    defaultSenderEmail,
  });

  await createAuditLog({
    workspaceId,
    actorId: userId,
    action: "sending_domain.create",
    entityType: "settings",
    entityId: domain.id,
    after: domainSnapshot(domain),
  });

  return domain;
}

export async function refreshSendingDomainForWorkspace(
  workspaceId: string,
  userId: string,
  domainId: string,
): Promise<SendingDomainRecord> {
  const domain = await getSendingDomainForWorkspace(workspaceId, domainId);
  const providerDomain = await getProviderDomain(domain.providerDomainId);
  const updated = await updateSendingDomain(
    workspaceId,
    domainId,
    mapProviderDomainToUpdate(providerDomain),
  );

  if (!updated) {
    throw new AppError("NOT_FOUND", "Sending domain not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId: userId,
    action: "sending_domain.refresh",
    entityType: "settings",
    entityId: updated.id,
    after: domainSnapshot(updated),
  });

  return updated;
}

export async function verifySendingDomainForWorkspace(
  workspaceId: string,
  userId: string,
  domainId: string,
): Promise<SendingDomainRecord> {
  const domain = await getSendingDomainForWorkspace(workspaceId, domainId);
  const providerDomain = await verifyProviderDomain(domain.providerDomainId);
  const updated = await updateSendingDomain(
    workspaceId,
    domainId,
    mapProviderDomainToUpdate(providerDomain),
  );

  if (!updated) {
    throw new AppError("NOT_FOUND", "Sending domain not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId: userId,
    action: "sending_domain.verify",
    entityType: "settings",
    entityId: updated.id,
    after: domainSnapshot(updated),
  });

  return updated;
}

export async function updateSendingDomainSettingsForWorkspace(
  workspaceId: string,
  userId: string,
  domainId: string,
  input: UpdateSendingDomainInput,
): Promise<SendingDomainRecord> {
  const domain = await getSendingDomainForWorkspace(workspaceId, domainId);

  if (input.defaultSenderEmail !== undefined && input.defaultSenderEmail !== null) {
    assertSenderEmailOnDomain(input.defaultSenderEmail, domain.domain);
  }

  const updated = await updateSendingDomain(workspaceId, domainId, {
    defaultSenderEmail: input.defaultSenderEmail,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "Sending domain not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId: userId,
    action: "sending_domain.update",
    entityType: "settings",
    entityId: updated.id,
    after: domainSnapshot(updated),
  });

  return updated;
}

export async function deleteSendingDomainForWorkspace(
  workspaceId: string,
  userId: string,
  domainId: string,
): Promise<void> {
  const domain = await getSendingDomainForWorkspace(workspaceId, domainId);
  const campaignCount = await countCampaignsBySendingDomainId(workspaceId, domainId);

  if (campaignCount > 0) {
    throw new AppError(
      "CONFLICT",
      campaignCount === 1
        ? "This domain is used by 1 campaign. Change its sending domain before removing it."
        : `This domain is used by ${campaignCount} campaigns. Change their sending domains before removing it.`,
    );
  }

  try {
    await deleteProviderDomain(domain.providerDomainId);
  } catch {
    // Domain may already be removed upstream; continue with local delete.
  }

  const deleted = await deleteSendingDomain(workspaceId, domainId);

  if (!deleted) {
    throw new AppError("NOT_FOUND", "Sending domain not found.");
  }

  await createAuditLog({
    workspaceId,
    actorId: userId,
    action: "sending_domain.delete",
    entityType: "settings",
    entityId: domainId,
    after: domainSnapshot(domain),
  });
}

export function listSenderEmailsForDomain(domain: SendingDomainRecord): string[] {
  const base = domain.defaultSenderEmail ?? `hello@${domain.domain}`;
  const localPart = base.split("@")[0] ?? "hello";
  const candidates = new Set<string>([
    base,
    `${localPart}@${domain.domain}`,
    `hello@${domain.domain}`,
    `sales@${domain.domain}`,
    `newsletter@${domain.domain}`,
  ]);

  return [...candidates].sort();
}

export async function assertVerifiedSenderEmail(
  workspaceId: string,
  sendingDomainId: string,
  senderEmail: string,
): Promise<SendingDomainRecord> {
  const domain = await findSendingDomainById(workspaceId, sendingDomainId);

  if (!domain) {
    throw new AppError("VALIDATION_ERROR", "Select a verified sending domain.");
  }

  if (domain.status !== "verified") {
    throw new AppError(
      "VALIDATION_ERROR",
      "This domain is not verified yet. Please verify your sending domain before launching campaigns.",
    );
  }

  assertSenderEmailOnDomain(senderEmail, domain.domain);
  return domain;
}
