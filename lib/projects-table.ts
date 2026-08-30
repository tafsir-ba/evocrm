import { daysSince, formatLocation, formatRelativeAge, hasPositiveCount } from "@/lib/list-view";

export type ProjectInventoryCounts = {
  leads?: number;
  properties?: number;
  opportunities?: number;
  activeCampaigns?: number;
  lastActivityAt?: string | Date | null;
};

export type ProjectInventoryPart = {
  key: "properties" | "pipeline" | "dripping";
  label: string;
  value: number;
};

export type ProjectListStatus = {
  label: "Archived" | "Stale" | "Active";
  tone: "muted" | "warn" | "success";
};

const PROJECT_STALE_DAYS = 14;

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
    parts.push({ key: "dripping", label: "Dripping", value: counts?.activeCampaigns ?? 0 });
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

export function anyProjectHasActivity(
  projects: Array<{ counts?: ProjectInventoryCounts | null }>,
): boolean {
  return projects.some((project) => Boolean(project.counts?.lastActivityAt));
}

export function projectListStatus(input: {
  archivedAt?: string | Date | null;
  lastActivityAt?: string | Date | null;
  createdAt: string | Date;
  now?: Date;
}): ProjectListStatus {
  if (input.archivedAt) {
    return { label: "Archived", tone: "muted" };
  }

  const now = input.now ?? new Date();
  const lastTouch = input.lastActivityAt ?? input.createdAt;
  const ageDays = daysSince(lastTouch, now);
  if (ageDays !== null && ageDays >= PROJECT_STALE_DAYS) {
    return { label: "Stale", tone: "warn" };
  }

  return { label: "Active", tone: "success" };
}

export function formatProjectActivity(
  lastActivityAt: string | Date | null | undefined,
  now?: Date,
): string {
  if (!lastActivityAt) {
    return "—";
  }

  return formatRelativeAge(lastActivityAt, now);
}
