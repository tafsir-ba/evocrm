import {
  formatInboundDemandLine,
  projectDemandStatus,
  type InboundReceivedBasis,
  type ProjectDemandStatus,
} from "@/lib/inbound-received-at";
import { formatLocation, hasPositiveCount } from "@/lib/list-view";

export type ProjectInventoryCounts = {
  leads?: number;
  properties?: number;
  opportunities?: number;
  activeCampaigns?: number;
  lastActivityAt?: string | Date | null;
  lastGenuineInboundAt?: string | Date | null;
  lastGenuineInboundBasis?: InboundReceivedBasis | null;
};

export type ProjectInventoryPart = {
  key: "properties" | "pipeline" | "workflows";
  label: string;
  value: number;
};

export type ProjectListStatus = ProjectDemandStatus;

export function formatProjectLocation(
  city: string | null | undefined,
  country: string | null | undefined,
): string {
  return formatLocation(city, country);
}

export function formatProjectInventory(
  counts: ProjectInventoryCounts | null | undefined,
): ProjectInventoryPart[] {
  const parts: ProjectInventoryPart[] = [];
  if (hasPositiveCount(counts?.properties)) {
    parts.push({ key: "properties", label: "Properties", value: counts?.properties ?? 0 });
  }
  if (hasPositiveCount(counts?.opportunities)) {
    parts.push({ key: "pipeline", label: "Pipeline", value: counts?.opportunities ?? 0 });
  }
  if (hasPositiveCount(counts?.activeCampaigns)) {
    const value = counts?.activeCampaigns ?? 0;
    parts.push({
      key: "workflows",
      label: value === 1 ? "Workflow" : "Workflows",
      value,
    });
  }
  return parts;
}

export function formatProjectInventoryLine(
  counts: ProjectInventoryCounts | null | undefined,
): string {
  const parts = formatProjectInventory(counts);
  return parts.length > 0
    ? parts.map((part) => `${part.value} ${part.label.toLowerCase()}`).join(" · ")
    : "—";
}

export function anyProjectHasInventory(
  projects: Array<{ counts?: ProjectInventoryCounts | null }>,
): boolean {
  return projects.some((project) => formatProjectInventory(project.counts).length > 0);
}

export function anyProjectHasInbound(
  projects: Array<{ counts?: ProjectInventoryCounts | null }>,
): boolean {
  return projects.some((project) => Boolean(project.counts?.lastGenuineInboundAt));
}

/** @deprecated Use anyProjectHasInbound — activity timestamps are not demand. */
export function anyProjectHasActivity(
  projects: Array<{ counts?: ProjectInventoryCounts | null }>,
): boolean {
  return anyProjectHasInbound(projects);
}

export function projectListStatus(input: {
  archivedAt?: string | Date | null;
  lastGenuineInboundAt?: string | Date | null;
  lastActivityAt?: string | Date | null;
  createdAt?: string | Date;
  now?: Date;
}): ProjectListStatus {
  return projectDemandStatus({
    archivedAt: input.archivedAt,
    lastGenuineInboundAt: input.lastGenuineInboundAt,
    now: input.now,
  });
}

export function formatProjectActivity(
  lastGenuineInboundAt: string | Date | null | undefined,
  basis?: InboundReceivedBasis | null,
  now?: Date,
): string {
  return formatInboundDemandLine(lastGenuineInboundAt, basis, now);
}
