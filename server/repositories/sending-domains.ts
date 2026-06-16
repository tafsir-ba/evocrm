import "server-only";

import { connectDb } from "@/server/db/mongoose";
import {
  SendingDomainModel,
  type SendingDomainDocument,
} from "@/models/sending-domain";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import { AppError } from "@/server/errors";

export type DnsRecordStatus = "missing" | "pending" | "valid" | "invalid";

export type DnsRecord = {
  record: string;
  name: string;
  type: string;
  value: string;
  priority: number | null;
  ttl: string | null;
  status: DnsRecordStatus;
};

export type SendingDomainRecord = {
  id: string;
  workspaceId: string;
  domain: string;
  provider: "resend";
  providerDomainId: string;
  status: "pending" | "verified" | "failed" | "needs_attention";
  spfStatus: DnsRecordStatus;
  dkimStatus: DnsRecordStatus;
  dmarcStatus: DnsRecordStatus;
  defaultSenderEmail: string | null;
  dnsRecords: DnsRecord[];
  lastCheckedAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapDnsRecordStatus(status: string | undefined): DnsRecordStatus {
  if (status === "verified" || status === "valid") {
    return "valid";
  }
  if (status === "failed" || status === "invalid") {
    return "invalid";
  }
  if (status === "not_started" || status === "pending" || status === "temporary_failure") {
    return "pending";
  }
  return "missing";
}

function toDnsRecords(records: SendingDomainDocument["dnsRecords"]): DnsRecord[] {
  return (records ?? []).map((record) => ({
    record: record.record,
    name: record.name,
    type: record.type,
    value: record.value,
    priority: record.priority ?? null,
    ttl: record.ttl ?? null,
    status: mapDnsRecordStatus(record.status ?? undefined),
  }));
}

function deriveRecordHealth(
  records: DnsRecord[],
  recordType: string,
): DnsRecordStatus {
  const matches = records.filter(
    (record) => record.record.toUpperCase() === recordType.toUpperCase(),
  );

  if (matches.length === 0) {
    return "missing";
  }

  if (matches.every((record) => record.status === "valid")) {
    return "valid";
  }

  if (matches.some((record) => record.status === "invalid")) {
    return "invalid";
  }

  return "pending";
}

export function mapProviderDomainStatus(
  status: string | undefined,
): SendingDomainRecord["status"] {
  if (status === "verified") {
    return "verified";
  }
  if (status === "failed" || status === "failure") {
    return "failed";
  }
  if (status === "temporary_failure" || status === "not_started") {
    return "needs_attention";
  }
  return "pending";
}

export function toSendingDomainRecord(
  document: SendingDomainDocument,
): SendingDomainRecord {
  const dnsRecords = toDnsRecords(document.dnsRecords);

  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    domain: document.domain,
    provider: "resend",
    providerDomainId: document.providerDomainId,
    status: document.status as SendingDomainRecord["status"],
    spfStatus: document.spfStatus as DnsRecordStatus,
    dkimStatus: document.dkimStatus as DnsRecordStatus,
    dmarcStatus: document.dmarcStatus as DnsRecordStatus,
    defaultSenderEmail: document.defaultSenderEmail ?? null,
    dnsRecords,
    lastCheckedAt: document.lastCheckedAt ?? null,
    verifiedAt: document.verifiedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export function buildDnsRecordsFromProvider(
  records: Array<{
    record: string;
    name: string;
    type: string;
    value: string;
    priority?: number;
    ttl?: string;
    status?: string;
  }>,
): DnsRecord[] {
  return records.map((record) => ({
    record: record.record,
    name: record.name,
    type: record.type,
    value: record.value,
    priority: record.priority ?? null,
    ttl: record.ttl ?? null,
    status: mapDnsRecordStatus(record.status),
  }));
}

export function deriveDomainHealth(dnsRecords: DnsRecord[]): {
  spfStatus: DnsRecordStatus;
  dkimStatus: DnsRecordStatus;
  dmarcStatus: DnsRecordStatus;
} {
  return {
    spfStatus: deriveRecordHealth(dnsRecords, "SPF"),
    dkimStatus: deriveRecordHealth(dnsRecords, "DKIM"),
    dmarcStatus: deriveRecordHealth(dnsRecords, "DMARC"),
  };
}

export async function findSendingDomains(
  workspaceId: string,
): Promise<SendingDomainRecord[]> {
  await connectDb();

  const documents = await SendingDomainModel.find(withWorkspaceScope(workspaceId, {}))
    .sort({ domain: 1 })
    .lean();

  return documents.map((doc) => toSendingDomainRecord(doc as SendingDomainDocument));
}

export async function findSendingDomainById(
  workspaceId: string,
  domainId: string,
): Promise<SendingDomainRecord | null> {
  await connectDb();

  const document = await SendingDomainModel.findOne(
    withWorkspaceScope(workspaceId, { _id: domainId }),
  ).lean();

  return document ? toSendingDomainRecord(document as SendingDomainDocument) : null;
}

export async function findVerifiedSendingDomainById(
  workspaceId: string,
  domainId: string,
): Promise<SendingDomainRecord | null> {
  const domain = await findSendingDomainById(workspaceId, domainId);
  return domain?.status === "verified" ? domain : null;
}

export async function findSendingDomainByName(
  workspaceId: string,
  domain: string,
): Promise<SendingDomainRecord | null> {
  await connectDb();

  const document = await SendingDomainModel.findOne(
    withWorkspaceScope(workspaceId, { domain: domain.toLowerCase().trim() }),
  ).lean();

  return document ? toSendingDomainRecord(document as SendingDomainDocument) : null;
}

export type CreateSendingDomainInput = {
  domain: string;
  provider: "resend";
  providerDomainId: string;
  status: SendingDomainRecord["status"];
  dnsRecords: DnsRecord[];
  defaultSenderEmail?: string | null;
};

export async function createSendingDomain(
  workspaceId: string,
  input: CreateSendingDomainInput,
): Promise<SendingDomainRecord> {
  await connectDb();

  const health = deriveDomainHealth(input.dnsRecords);

  try {
    const document = await SendingDomainModel.create({
      workspaceId,
      domain: input.domain.toLowerCase().trim(),
      provider: input.provider,
      providerDomainId: input.providerDomainId,
      status: input.status,
      spfStatus: health.spfStatus,
      dkimStatus: health.dkimStatus,
      dmarcStatus: health.dmarcStatus,
      defaultSenderEmail: input.defaultSenderEmail ?? `hello@${input.domain.toLowerCase().trim()}`,
      dnsRecords: input.dnsRecords,
      lastCheckedAt: new Date(),
      verifiedAt: input.status === "verified" ? new Date() : null,
    });

    return toSendingDomainRecord(document.toObject() as SendingDomainDocument);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: number }).code === 11000
    ) {
      throw new AppError("CONFLICT", "This domain is already added to this workspace.");
    }

    throw error;
  }
}

export type UpdateSendingDomainInput = Partial<{
  status: SendingDomainRecord["status"];
  spfStatus: DnsRecordStatus;
  dkimStatus: DnsRecordStatus;
  dmarcStatus: DnsRecordStatus;
  defaultSenderEmail: string | null;
  dnsRecords: DnsRecord[];
  lastCheckedAt: Date;
  verifiedAt: Date | null;
}>;

export async function updateSendingDomain(
  workspaceId: string,
  domainId: string,
  input: UpdateSendingDomainInput,
): Promise<SendingDomainRecord | null> {
  await connectDb();

  const document = await SendingDomainModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, { _id: domainId }),
    { $set: input },
    { new: true },
  ).lean();

  return document ? toSendingDomainRecord(document as SendingDomainDocument) : null;
}

export async function deleteSendingDomain(
  workspaceId: string,
  domainId: string,
): Promise<boolean> {
  await connectDb();

  const result = await SendingDomainModel.deleteOne(
    withWorkspaceScope(workspaceId, { _id: domainId }),
  );

  return result.deletedCount > 0;
}
