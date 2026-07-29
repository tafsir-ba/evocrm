import "server-only";

import { connectDb } from "@/server/db/mongoose";
import { DocumentModel, type DocumentDocument } from "@/models/document";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type DocumentRecord = {
  id: string;
  workspaceId: string;
  linkedEntityType: "lead" | "property" | "opportunity" | "campaign";
  linkedEntityId: string;
  ownerId: string | null;
  uploadedBy: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  bucket: string;
  storageKey: string;
  visibility: "private" | "workspace";
  status: "active" | "archived" | "failed";
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDocumentRecord(document: DocumentDocument): DocumentRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    linkedEntityType: document.linkedEntityType,
    linkedEntityId: document.linkedEntityId.toString(),
    ownerId: document.ownerId?.toString() ?? null,
    uploadedBy: document.uploadedBy.toString(),
    fileName: document.fileName,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    bucket: document.bucket,
    storageKey: document.storageKey,
    visibility: document.visibility,
    status: document.status,
    archivedAt: document.archivedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export type DocumentListFilter = {
  includeArchived?: boolean;
  linkedEntityType?: "lead" | "property" | "opportunity" | "campaign";
  linkedEntityId?: string;
  mimeTypePrefix?: "image/";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

function buildListQuery(filter: DocumentListFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (!filter.includeArchived) {
    query.status = "active";
    query.archivedAt = null;
  } else {
    query.status = { $in: ["active", "archived"] };
  }

  if (filter.linkedEntityType) {
    query.linkedEntityType = filter.linkedEntityType;
  }

  if (filter.linkedEntityId) {
    query.linkedEntityId = filter.linkedEntityId;
  }

  if (filter.mimeTypePrefix) {
    query.mimeType = { $regex: `^${filter.mimeTypePrefix}` };
  }

  return query;
}

export async function findDocuments(
  workspaceId: string,
  filter: DocumentListFilter = {},
): Promise<{ documents: DocumentRecord[]; total: number }> {
  await connectDb();

  const query = withWorkspaceScope(workspaceId, buildListQuery(filter));
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;
  const skip = (page - 1) * pageSize;
  const sortDirection = filter.sortOrder === "asc" ? 1 : -1;

  const [documents, total] = await Promise.all([
    DocumentModel.find(query)
      .sort({ createdAt: sortDirection })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    DocumentModel.countDocuments(query),
  ]);

  return {
    documents: documents.map((doc) => toDocumentRecord(doc as DocumentDocument)),
    total,
  };
}

export async function findDocumentById(
  workspaceId: string,
  documentId: string,
): Promise<DocumentRecord | null> {
  await connectDb();

  const document = await DocumentModel.findOne(
    withWorkspaceScope(workspaceId, { _id: documentId }),
  ).lean();

  if (!document) {
    return null;
  }

  return toDocumentRecord(document as DocumentDocument);
}

export async function findDocumentsByIds(
  workspaceId: string,
  documentIds: string[],
): Promise<DocumentRecord[]> {
  if (documentIds.length === 0) {
    return [];
  }

  await connectDb();

  const documents = await DocumentModel.find(
    withWorkspaceScope(workspaceId, {
      _id: { $in: documentIds },
      status: "active",
      archivedAt: null,
    }),
  ).lean();

  const byId = new Map(
    documents.map((document) => {
      const record = toDocumentRecord(document as DocumentDocument);
      return [record.id, record] as const;
    }),
  );

  return documentIds
    .map((documentId) => byId.get(documentId))
    .filter((document): document is DocumentRecord => Boolean(document));
}

export type CreateDocumentInput = {
  linkedEntityType: "lead" | "property" | "opportunity" | "campaign";
  linkedEntityId: string;
  ownerId?: string | null;
  uploadedBy: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  bucket: string;
  storageKey: string;
  visibility: "private" | "workspace";
};

export async function createDocument(
  workspaceId: string,
  input: CreateDocumentInput,
): Promise<DocumentRecord> {
  await connectDb();

  const document = await DocumentModel.create({
    workspaceId,
    linkedEntityType: input.linkedEntityType,
    linkedEntityId: input.linkedEntityId,
    ownerId: input.ownerId ?? null,
    uploadedBy: input.uploadedBy,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    bucket: input.bucket,
    storageKey: input.storageKey,
    visibility: input.visibility,
    status: "active",
    archivedAt: null,
  });

  return toDocumentRecord(document);
}

export async function archiveDocument(
  workspaceId: string,
  documentId: string,
): Promise<DocumentRecord | null> {
  await connectDb();

  const document = await DocumentModel.findOneAndUpdate(
    withWorkspaceScope(workspaceId, {
      _id: documentId,
      status: "active",
      archivedAt: null,
    }),
    {
      $set: {
        status: "archived",
        archivedAt: new Date(),
      },
    },
    { new: true },
  ).lean();

  if (!document) {
    return null;
  }

  return toDocumentRecord(document as DocumentDocument);
}
