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
  delayDays: number;
  channel: "email";
  subject: string;
  body: string;
  documentIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

function toCampaignStepRecord(document: CampaignStepDocument): CampaignStepRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    campaignId: document.campaignId.toString(),
    order: document.order,
    delayDays: document.delayDays,
    channel: "email",
    subject: document.subject,
    body: document.body,
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
  delayDays: number;
  subject: string;
  body: string;
  documentIds?: string[];
};

export async function createCampaignStep(
  workspaceId: string,
  input: CreateCampaignStepInput,
): Promise<CampaignStepRecord> {
  await connectDb();

  try {
    const document = await CampaignStepModel.create({
      workspaceId,
      campaignId: input.campaignId,
      order: input.order,
      delayDays: input.delayDays,
      channel: "email",
      subject: input.subject.trim(),
      body: input.body.trim(),
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
    delayDays: number;
    subject: string;
    body: string;
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
