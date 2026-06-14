import "server-only";

import {
  IntegrationLogModel,
  type IntegrationLogDocument,
  INTEGRATION_LOG_DIRECTIONS,
  INTEGRATION_LOG_STATUSES,
} from "@/models/integration-log";
import { connectDb } from "@/server/db/mongoose";
import { withWorkspaceScope } from "@/server/workspaces/with-workspace-scope";

export type IntegrationLogDirection = (typeof INTEGRATION_LOG_DIRECTIONS)[number];
export type IntegrationLogStatus = (typeof INTEGRATION_LOG_STATUSES)[number];

export type IntegrationLogRecord = {
  id: string;
  workspaceId: string;
  integrationId: string;
  direction: IntegrationLogDirection;
  status: IntegrationLogStatus;
  eventType: string;
  payloadSummary: Record<string, unknown> | null;
  error: string | null;
  createdAt: Date;
};

function toIntegrationLogRecord(document: IntegrationLogDocument): IntegrationLogRecord {
  return {
    id: document._id.toString(),
    workspaceId: document.workspaceId.toString(),
    integrationId: document.integrationId.toString(),
    direction: document.direction as IntegrationLogDirection,
    status: document.status as IntegrationLogStatus,
    eventType: document.eventType,
    payloadSummary: (document.payloadSummary as Record<string, unknown> | null) ?? null,
    error: document.error ?? null,
    createdAt: document.createdAt,
  };
}

export type IntegrationLogListFilter = {
  integrationId?: string;
  status?: IntegrationLogStatus;
  eventType?: string;
  limit?: number;
};

export async function findIntegrationLogs(
  workspaceId: string,
  filter: IntegrationLogListFilter = {},
): Promise<IntegrationLogRecord[]> {
  await connectDb();

  const query: Record<string, unknown> = {};

  if (filter.integrationId) {
    query.integrationId = filter.integrationId;
  }

  if (filter.status) {
    query.status = filter.status;
  }

  if (filter.eventType) {
    query.eventType = filter.eventType;
  }

  const limit = filter.limit ?? 50;

  const documents = await IntegrationLogModel.find(
    withWorkspaceScope(workspaceId, query),
  )
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<IntegrationLogDocument[]>();

  return documents.map(toIntegrationLogRecord);
}

export async function createIntegrationLog(input: {
  workspaceId: string;
  integrationId: string;
  direction: IntegrationLogDirection;
  status: IntegrationLogStatus;
  eventType: string;
  payloadSummary?: Record<string, unknown> | null;
  error?: string | null;
}): Promise<IntegrationLogRecord> {
  await connectDb();

  const document = await IntegrationLogModel.create({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    direction: input.direction,
    status: input.status,
    eventType: input.eventType,
    payloadSummary: input.payloadSummary ?? null,
    error: input.error ?? null,
  });

  return toIntegrationLogRecord(document);
}
