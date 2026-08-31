import "server-only";

import { AppError } from "@/server/errors";
import { connectDb } from "@/server/db/mongoose";
import { WorkspaceModel, type WorkspaceDocument } from "@/models/workspace";

export type WorkspaceLeadEnrichmentSettings = {
  enabled: boolean;
  demoMode: boolean;
  retentionDays: number;
  legalReviewAcknowledgedAt: Date | null;
  legalReviewAcknowledgedBy: string | null;
};

export type WorkspaceRecord = {
  id: string;
  name: string;
  slug: string;
  type: string;
  timezone: string;
  defaultCurrency: string;
  leadEnrichment?: WorkspaceLeadEnrichmentSettings;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function defaultLeadEnrichmentSettings(): WorkspaceLeadEnrichmentSettings {
  return {
    enabled: true,
    demoMode: false,
    retentionDays: 180,
    legalReviewAcknowledgedAt: null,
    legalReviewAcknowledgedBy: null,
  };
}

function readLeadEnrichmentSettings(
  document: WorkspaceDocument,
): WorkspaceLeadEnrichmentSettings {
  const raw = (
    document as WorkspaceDocument & {
      leadEnrichment?: Partial<WorkspaceLeadEnrichmentSettings> & {
        legalReviewAcknowledgedAt?: Date | null;
        legalReviewAcknowledgedBy?: { toString(): string } | null;
      };
    }
  ).leadEnrichment;
  const defaults = defaultLeadEnrichmentSettings();
  if (!raw) {
    return defaults;
  }
  return {
    enabled: raw.enabled !== false,
    demoMode: raw.demoMode === true,
    retentionDays:
      typeof raw.retentionDays === "number" && raw.retentionDays > 0
        ? raw.retentionDays
        : defaults.retentionDays,
    legalReviewAcknowledgedAt: raw.legalReviewAcknowledgedAt ?? null,
    legalReviewAcknowledgedBy: raw.legalReviewAcknowledgedBy
      ? String(raw.legalReviewAcknowledgedBy)
      : null,
  };
}

function toWorkspaceRecord(document: WorkspaceDocument): WorkspaceRecord {
  return {
    id: document._id.toString(),
    name: document.name,
    slug: document.slug,
    type: document.type,
    timezone: document.timezone,
    defaultCurrency: document.defaultCurrency,
    leadEnrichment: readLeadEnrichmentSettings(document),
    createdBy: document.createdBy.toString(),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findAllWorkspaces(): Promise<WorkspaceRecord[]> {
  await connectDb();
  const documents = await WorkspaceModel.find().lean<WorkspaceDocument[]>();
  return documents.map(toWorkspaceRecord);
}

export async function findWorkspaceBySlug(slug: string): Promise<WorkspaceRecord | null> {
  await connectDb();
  const document = await WorkspaceModel.findOne({
    slug: slug.toLowerCase().trim(),
  }).lean<WorkspaceDocument>();
  return document ? toWorkspaceRecord(document) : null;
}

export async function findWorkspaceById(workspaceId: string): Promise<WorkspaceRecord | null> {
  await connectDb();
  const document = await WorkspaceModel.findById(workspaceId).lean<WorkspaceDocument>();
  return document ? toWorkspaceRecord(document) : null;
}

export async function slugExists(slug: string): Promise<boolean> {
  await connectDb();
  const count = await WorkspaceModel.countDocuments({ slug: slug.toLowerCase().trim() });
  return count > 0;
}

export async function createWorkspace(input: {
  name: string;
  slug: string;
  type: string;
  timezone: string;
  defaultCurrency: string;
  createdBy: string;
}): Promise<WorkspaceRecord> {
  await connectDb();
  const document = await WorkspaceModel.create({
    name: input.name,
    slug: input.slug.toLowerCase().trim(),
    type: input.type,
    timezone: input.timezone,
    defaultCurrency: input.defaultCurrency,
    createdBy: input.createdBy,
  });

  return toWorkspaceRecord(document.toObject() as WorkspaceDocument);
}

export async function updateWorkspace(
  workspaceId: string,
  input: Partial<
    Pick<WorkspaceRecord, "name" | "type" | "timezone" | "defaultCurrency">
  > & {
    leadEnrichment?: Partial<WorkspaceLeadEnrichmentSettings>;
  },
): Promise<WorkspaceRecord> {
  await connectDb();
  const $set: Record<string, unknown> = {};
  if (input.name !== undefined) $set.name = input.name;
  if (input.type !== undefined) $set.type = input.type;
  if (input.timezone !== undefined) $set.timezone = input.timezone;
  if (input.defaultCurrency !== undefined) $set.defaultCurrency = input.defaultCurrency;
  if (input.leadEnrichment) {
    if (input.leadEnrichment.enabled !== undefined) {
      $set["leadEnrichment.enabled"] = input.leadEnrichment.enabled;
    }
    if (input.leadEnrichment.demoMode !== undefined) {
      $set["leadEnrichment.demoMode"] = input.leadEnrichment.demoMode;
    }
    if (input.leadEnrichment.retentionDays !== undefined) {
      $set["leadEnrichment.retentionDays"] = input.leadEnrichment.retentionDays;
    }
    if (input.leadEnrichment.legalReviewAcknowledgedAt !== undefined) {
      $set["leadEnrichment.legalReviewAcknowledgedAt"] =
        input.leadEnrichment.legalReviewAcknowledgedAt;
    }
    if (input.leadEnrichment.legalReviewAcknowledgedBy !== undefined) {
      $set["leadEnrichment.legalReviewAcknowledgedBy"] =
        input.leadEnrichment.legalReviewAcknowledgedBy;
    }
  }
  const document = await WorkspaceModel.findByIdAndUpdate(
    workspaceId,
    { $set },
    { new: true, runValidators: true },
  ).lean<WorkspaceDocument>();

  if (!document) {
    throw new AppError("NOT_FOUND", "Workspace not found.");
  }

  return toWorkspaceRecord(document);
}

export async function deleteWorkspaceById(workspaceId: string): Promise<void> {
  await connectDb();
  const result = await WorkspaceModel.deleteOne({ _id: workspaceId });

  if (result.deletedCount === 0) {
    throw new AppError("NOT_FOUND", "Workspace not found.");
  }
}
