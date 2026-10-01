import "server-only";

import { connectDb } from "@/server/db/mongoose";
import {
  NewsletterAudienceSegmentModel,
  type NewsletterAudienceSegmentDocument,
} from "@/models/newsletter-audience-segment";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type NewsletterAudienceSegmentType = "project_tags" | "csv_import";

export type NewsletterAudienceSegmentRecord = {
  id: string;
  workspaceId: string;
  campaignId: string;
  type: NewsletterAudienceSegmentType;
  order: number;
  projectId: string;
  tagIds: string[];
  tagMatch: "any" | "all";
  importJobId: string | null;
  applyTagId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toSegmentRecord(
  document: NewsletterAudienceSegmentDocument,
): NewsletterAudienceSegmentRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    campaignId: document.campaignId.toString(),
    type: (document.type as NewsletterAudienceSegmentType | undefined) ?? "project_tags",
    order: document.order,
    projectId: document.projectId.toString(),
    tagIds: (document.tagIds ?? []).map((id) => id.toString()),
    tagMatch: (document.tagMatch as "any" | "all" | undefined) ?? "any",
    importJobId: document.importJobId ? document.importJobId.toString() : null,
    applyTagId: document.applyTagId ? document.applyTagId.toString() : null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function findNewsletterAudienceSegments(
  workspaceId: string,
  campaignId: string,
): Promise<NewsletterAudienceSegmentRecord[]> {
  await connectDb();

  const documents = await NewsletterAudienceSegmentModel.find(
    withWorkspaceScope(workspaceId, { campaignId }),
  )
    .sort({ order: 1, createdAt: 1 })
    .lean<NewsletterAudienceSegmentDocument[]>();

  return documents.map(toSegmentRecord);
}

export type UpsertNewsletterAudienceSegmentInput =
  | {
      type: "project_tags";
      order: number;
      projectId: string;
      tagIds: string[];
      tagMatch: "any" | "all";
    }
  | {
      type: "csv_import";
      order: number;
      projectId: string;
      importJobId: string;
      applyTagId: string | null;
    };

export async function replaceNewsletterAudienceSegments(
  workspaceId: string,
  campaignId: string,
  segments: UpsertNewsletterAudienceSegmentInput[],
): Promise<NewsletterAudienceSegmentRecord[]> {
  await connectDb();

  await NewsletterAudienceSegmentModel.deleteMany(
    withWorkspaceScope(workspaceId, { campaignId }),
  );

  if (segments.length === 0) {
    return [];
  }

  const created = await NewsletterAudienceSegmentModel.insertMany(
    segments.map((segment) => {
      if (segment.type === "csv_import") {
        return {
          workspaceId,
          campaignId,
          type: segment.type,
          order: segment.order,
          projectId: segment.projectId,
          tagIds: [],
          tagMatch: "any",
          importJobId: segment.importJobId,
          applyTagId: segment.applyTagId,
        };
      }

      return {
        workspaceId,
        campaignId,
        type: segment.type,
        order: segment.order,
        projectId: segment.projectId,
        tagIds: segment.tagIds,
        tagMatch: segment.tagMatch,
        importJobId: null,
        applyTagId: null,
      };
    }),
  );

  return created.map((document) =>
    toSegmentRecord(document.toObject() as NewsletterAudienceSegmentDocument),
  );
}

export async function deleteNewsletterAudienceSegmentsForCampaign(
  workspaceId: string,
  campaignId: string,
): Promise<number> {
  await connectDb();

  const result = await NewsletterAudienceSegmentModel.deleteMany(
    withWorkspaceScope(workspaceId, { campaignId }),
  );

  return result.deletedCount;
}
