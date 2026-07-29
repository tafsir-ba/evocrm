import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { CampaignStepModel, type CampaignStepDocument } from "@/models/campaign-step";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";
import { AppError } from "@/server/errors";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: number }).code === 11000
  );
}

export type CampaignStepRecord = {
  id: string;
  workspaceId: string;
  campaignId: string;
  order: number;
  name: string | null;
  delayDays: number;
  delayAmount: number | null;
  delayUnit: "days" | "hours";
  sendTime: string;
  fromName: string | null;
  channel: "email";
  status: "draft" | "ready" | "active" | "paused";
  contentMode: "rich_text" | "plain_text" | "html";
  subject: string;
  previewText: string | null;
  body: string;
  bodyHtml: string | null;
  bodyText: string | null;
  documentIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

function resolveStepStatus(document: CampaignStepDocument): CampaignStepRecord["status"] {
  if (document.status) {
    return document.status as CampaignStepRecord["status"];
  }

  const hasContent = Boolean(document.subject?.trim() && document.body?.trim());
  return hasContent ? "ready" : "draft";
}

function toCampaignStepRecord(document: CampaignStepDocument): CampaignStepRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    campaignId: document.campaignId.toString(),
    order: document.order,
    name: document.name ?? document.subject ?? null,
    delayDays: document.delayDays,
    delayAmount: document.delayAmount ?? document.delayDays,
    delayUnit: (document.delayUnit as CampaignStepRecord["delayUnit"]) ?? "days",
    sendTime: document.sendTime ?? "09:00",
    fromName: document.fromName ?? null,
    channel: "email",
    status: resolveStepStatus(document),
    contentMode: (document.contentMode as CampaignStepRecord["contentMode"]) ?? "plain_text",
    subject: document.subject ?? "",
    previewText: document.previewText ?? null,
    body: document.body ?? "",
    bodyHtml: document.bodyHtml ?? null,
    bodyText: document.bodyText ?? null,
    documentIds: (document.documentIds ?? []).map((id) => id.toString()),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findCampaignSteps(
  workspaceId: string,
  campaignId: string,
): Promise<CampaignStepRecord[]> {
  await connectDb();

  const documents = await CampaignStepModel.find(
    withWorkspaceScope(workspaceId, { campaignId }),
  )
    .sort({ order: 1 })
    .lean();

  return documents.map((doc) => toCampaignStepRecord(doc as CampaignStepDocument));
}

export async function findCampaignStepById(
  workspaceId: string,
  campaignId: string,
  stepId: string,
): Promise<CampaignStepRecord | null> {
  await connectDb();

  const document = await CampaignStepModel.findOne(
    withWorkspaceScope(workspaceId, { _id: stepId, campaignId }),
  ).lean();

  return document ? toCampaignStepRecord(document as CampaignStepDocument) : null;
}

export async function countCampaignSteps(
  workspaceId: string,
  campaignId: string,
): Promise<number> {
  await connectDb();

  return CampaignStepModel.countDocuments(
    withWorkspaceScope(workspaceId, { campaignId }),
  );
}

export type CreateCampaignStepInput = {
  campaignId: string;
  order: number;
  name?: string | null;
  delayDays: number;
  delayAmount?: number;
  delayUnit?: "days" | "hours";
  sendTime: string;
  fromName?: string | null;
  status?: CampaignStepRecord["status"];
  contentMode?: CampaignStepRecord["contentMode"];
  subject?: string;
  previewText?: string | null;
  body?: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
  documentIds?: string[];
};

export async function createCampaignStep(
  workspaceId: string,
  input: CreateCampaignStepInput,
): Promise<CampaignStepRecord> {
  await connectDb();

  const subject = input.subject?.trim() ?? "";
  const body = input.body?.trim() ?? "";
  const status =
    input.status ??
    (subject && body ? "ready" : "draft");

  try {
    const document = await CampaignStepModel.create({
      workspaceId,
      campaignId: input.campaignId,
      order: input.order,
      name: input.name?.trim() ?? (subject || `Email ${input.order}`),
      delayDays: input.delayDays,
      delayAmount: input.delayAmount ?? input.delayDays,
      delayUnit: input.delayUnit ?? "days",
      sendTime: input.sendTime,
      fromName: input.fromName?.trim() ?? null,
      channel: "email",
      status,
      contentMode: input.contentMode ?? "plain_text",
      subject,
      previewText: input.previewText?.trim() ?? null,
      body,
      bodyHtml: input.bodyHtml ?? null,
      bodyText: input.bodyText ?? null,
      documentIds: input.documentIds ?? [],
    });

    return toCampaignStepRecord(document.toObject() as CampaignStepDocument);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "CONFLICT",
        "A step with this order already exists for the campaign.",
      );
    }

    throw error;
  }
}

export async function updateCampaignStep(
  workspaceId: string,
  campaignId: string,
  stepId: string,
  input: Partial<{
    order: number;
    name: string | null;
    delayDays: number;
    delayAmount: number;
    delayUnit: "days" | "hours";
    sendTime: string;
    fromName: string | null;
    status: CampaignStepRecord["status"];
    contentMode: CampaignStepRecord["contentMode"];
    subject: string;
    previewText: string | null;
    body: string;
    bodyHtml: string | null;
    bodyText: string | null;
    documentIds: string[];
  }>,
): Promise<CampaignStepRecord | null> {
  await connectDb();

  try {
    const document = await CampaignStepModel.findOneAndUpdate(
      withWorkspaceScope(workspaceId, { _id: stepId, campaignId }),
      { $set: input },
      { new: true },
    ).lean();

    return document ? toCampaignStepRecord(document as CampaignStepDocument) : null;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "CONFLICT",
        "A step with this order already exists for the campaign.",
      );
    }

    throw error;
  }
}

export async function deleteCampaignStep(
  workspaceId: string,
  campaignId: string,
  stepId: string,
): Promise<boolean> {
  await connectDb();

  const result = await CampaignStepModel.deleteOne(
    withWorkspaceScope(workspaceId, { _id: stepId, campaignId }),
  );

  return result.deletedCount > 0;
}

/**
 * Apply a new campaign contact/from name to steps that still use a blank value,
 * the campaign title, or a previous campaign-level sender name.
 * Steps with a custom fromName are left unchanged.
 */
export async function syncCampaignStepFromNames(
  workspaceId: string,
  campaignId: string,
  input: {
    nextFromName: string;
    previousValues: Array<string | null | undefined>;
  },
): Promise<number> {
  const nextFromName = input.nextFromName.trim();
  if (!nextFromName) {
    return 0;
  }

  await connectDb();

  const replaceable = new Set(
    input.previousValues
      .map((value) => value?.trim() ?? "")
      .filter((value) => value.length > 0 && value !== nextFromName),
  );

  const filter = {
    ...withWorkspaceScope(workspaceId, { campaignId }),
    $or: [
      { fromName: null },
      { fromName: "" },
      ...(replaceable.size > 0 ? [{ fromName: { $in: [...replaceable] } }] : []),
    ],
  };

  const result = await CampaignStepModel.updateMany(filter, {
    $set: { fromName: nextFromName },
  });

  return result.modifiedCount ?? 0;
}

export async function findStepByOrder(
  workspaceId: string,
  campaignId: string,
  order: number,
): Promise<CampaignStepRecord | null> {
  await connectDb();

  const document = await CampaignStepModel.findOne(
    withWorkspaceScope(workspaceId, { campaignId, order }),
  ).lean();

  return document ? toCampaignStepRecord(document as CampaignStepDocument) : null;
}

export async function findNextStepAfterOrder(
  workspaceId: string,
  campaignId: string,
  currentOrder: number,
): Promise<CampaignStepRecord | null> {
  await connectDb();

  const document = await CampaignStepModel.findOne(
    withWorkspaceScope(workspaceId, { campaignId, order: { $gt: currentOrder } }),
  )
    .sort({ order: 1 })
    .lean();

  return document ? toCampaignStepRecord(document as CampaignStepDocument) : null;
}

export async function deleteCampaignStepsForCampaign(
  workspaceId: string,
  campaignId: string,
): Promise<number> {
  await connectDb();

  const result = await CampaignStepModel.deleteMany(
    withWorkspaceScope(workspaceId, { campaignId }),
  );

  return result.deletedCount;
}

export async function findFirstCampaignStep(
  workspaceId: string,
  campaignId: string,
): Promise<CampaignStepRecord | null> {
  await connectDb();

  const document = await CampaignStepModel.findOne(
    withWorkspaceScope(workspaceId, { campaignId }),
  )
    .sort({ order: 1 })
    .lean();

  return document ? toCampaignStepRecord(document as CampaignStepDocument) : null;
}

export async function reorderCampaignSteps(
  workspaceId: string,
  campaignId: string,
  stepIds: string[],
): Promise<CampaignStepRecord[]> {
  await connectDb();

  const existing = await findCampaignSteps(workspaceId, campaignId);

  if (existing.length !== stepIds.length) {
    throw new AppError("VALIDATION_ERROR", "All campaign steps must be included when reordering.");
  }

  const existingIds = new Set(existing.map((step) => step.id));
  for (const stepId of stepIds) {
    if (!existingIds.has(stepId)) {
      throw new AppError("VALIDATION_ERROR", "Invalid step in reorder request.");
    }
  }

  const tempBase = existing.length + 100;
  for (const [index, stepId] of stepIds.entries()) {
    await CampaignStepModel.updateOne(
      withWorkspaceScope(workspaceId, { _id: stepId, campaignId }),
      { $set: { order: tempBase + index } },
    );
  }

  for (const [index, stepId] of stepIds.entries()) {
    await CampaignStepModel.updateOne(
      withWorkspaceScope(workspaceId, { _id: stepId, campaignId }),
      { $set: { order: index + 1 } },
    );
  }

  return findCampaignSteps(workspaceId, campaignId);
}
