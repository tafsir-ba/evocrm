import { leadUrgency, type LeadUrgencyLevel } from "@/lib/leads-table";
import { LIST_DAY_MS, LIST_HOUR_MS, parseListDate } from "@/lib/list-view";

export const LEAD_BROWSER_SORTS = [
  "fullName",
  "phone",
  "company",
  "project",
  "source",
  "status",
  "owner",
  "age",
  "next",
  "urgency",
  "tags",
] as const;

export type LeadBrowserSort = (typeof LEAD_BROWSER_SORTS)[number];
export type LeadBrowserSortDir = "asc" | "desc";

export const LEAD_AGE_PRESETS = ["24h", "7d", "30d", "older_30d"] as const;
export type LeadAgePreset = (typeof LEAD_AGE_PRESETS)[number];

export const LEAD_NEXT_FILTERS = ["has_next", "no_next", "overdue"] as const;
export type LeadNextFilter = (typeof LEAD_NEXT_FILTERS)[number];

export const LEAD_URGENCY_FILTERS = [
  "overdue",
  "today",
  "soon",
  "stale",
  "unassigned",
  "none",
] as const;
export type LeadUrgencyFilter = (typeof LEAD_URGENCY_FILTERS)[number];

export const LEAD_BROWSER_SORT_LABELS: Record<LeadBrowserSort, string> = {
  fullName: "Lead",
  phone: "Phone",
  company: "Company",
  project: "Project",
  source: "Source",
  status: "Status",
  owner: "Owner",
  age: "Age",
  next: "Next",
  urgency: "Urgency",
  tags: "Tags",
};

export function isLeadBrowserSort(value: string | null | undefined): value is LeadBrowserSort {
  return LEAD_BROWSER_SORTS.includes(value as LeadBrowserSort);
}

export function readLeadBrowserSort(value: string | null | undefined): LeadBrowserSort {
  return isLeadBrowserSort(value) ? value : "age";
}

export function readLeadBrowserSortDir(
  value: string | null | undefined,
): LeadBrowserSortDir {
  return value === "asc" || value === "desc" ? value : "desc";
}

export function isLeadAgePreset(value: string | null | undefined): value is LeadAgePreset {
  return LEAD_AGE_PRESETS.includes(value as LeadAgePreset);
}

export function isLeadNextFilter(value: string | null | undefined): value is LeadNextFilter {
  return LEAD_NEXT_FILTERS.includes(value as LeadNextFilter);
}

export function isLeadUrgencyFilter(
  value: string | null | undefined,
): value is LeadUrgencyFilter {
  return LEAD_URGENCY_FILTERS.includes(value as LeadUrgencyFilter);
}

export function defaultSortDirForLeadColumn(sort: LeadBrowserSort): LeadBrowserSortDir {
  if (
    sort === "fullName" ||
    sort === "phone" ||
    sort === "company" ||
    sort === "project" ||
    sort === "source" ||
    sort === "status" ||
    sort === "owner" ||
    sort === "tags"
  ) {
    return "asc";
  }
  return "desc";
}

export function nextLeadBrowserSort(
  currentSort: LeadBrowserSort,
  currentDir: LeadBrowserSortDir,
  nextSort: LeadBrowserSort,
): { sort: LeadBrowserSort; sortDir: LeadBrowserSortDir } {
  if (currentSort === nextSort) {
    return { sort: nextSort, sortDir: currentDir === "asc" ? "desc" : "asc" };
  }

  return { sort: nextSort, sortDir: defaultSortDirForLeadColumn(nextSort) };
}

/** Sorts that Mongo can apply directly without joins or derived fields. */
export const LEAD_DATABASE_SORTS = ["fullName", "phone", "age"] as const;

export function isLeadDatabaseSort(sort: LeadBrowserSort): boolean {
  return (LEAD_DATABASE_SORTS as readonly string[]).includes(sort);
}

export function leadSortToMongoField(sort: LeadBrowserSort): string | null {
  if (sort === "fullName") {
    return "fullName";
  }
  if (sort === "phone") {
    return "phone";
  }
  if (sort === "age") {
    return "createdAt";
  }
  return null;
}

export function agePresetToCreatedRange(
  preset: LeadAgePreset,
  now: Date = new Date(),
): { createdFrom?: Date; createdTo?: Date } {
  if (preset === "24h") {
    return { createdFrom: new Date(now.getTime() - LIST_HOUR_MS * 24) };
  }
  if (preset === "7d") {
    return { createdFrom: new Date(now.getTime() - LIST_DAY_MS * 7) };
  }
  if (preset === "30d") {
    return { createdFrom: new Date(now.getTime() - LIST_DAY_MS * 30) };
  }
  return { createdTo: new Date(now.getTime() - LIST_DAY_MS * 30) };
}

export type LeadBrowserComparable = {
  id: string;
  fullName: string;
  phone?: string | null;
  createdAt: string | Date;
  archivedAt?: string | Date | null;
  lastContactedAt?: string | Date | null;
  company?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  source?: { id: string; label: string } | null;
  status?: { id: string; label: string } | null;
  assignedUser?: { id: string; name: string | null; email: string } | null;
  tagsResolved?: Array<{ id: string; name: string }>;
  lastActivity?: { id: string; title: string; at: string | Date } | null;
  nextAction?: { id: string; title: string; at: string | Date } | null;
};

function compareNullableText(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftValue = left?.trim() || "";
  const rightValue = right?.trim() || "";
  if (!leftValue && !rightValue) {
    return 0;
  }
  if (!leftValue) {
    return 1;
  }
  if (!rightValue) {
    return -1;
  }
  return leftValue.localeCompare(rightValue, undefined, { sensitivity: "base" });
}

function compareNullableTime(
  left: string | Date | null | undefined,
  right: string | Date | null | undefined,
): number {
  const leftTime = parseListDate(left)?.getTime() ?? null;
  const rightTime = parseListDate(right)?.getTime() ?? null;
  if (leftTime === null && rightTime === null) {
    return 0;
  }
  if (leftTime === null) {
    return 1;
  }
  if (rightTime === null) {
    return -1;
  }
  return leftTime - rightTime;
}

function ownerSortLabel(user: LeadBrowserComparable["assignedUser"]): string {
  if (!user) {
    return "";
  }
  return user.name?.trim() || user.email.trim() || "";
}

function tagsSortLabel(tags: LeadBrowserComparable["tagsResolved"]): string {
  if (!tags || tags.length === 0) {
    return "";
  }
  return [...tags]
    .map((tag) => tag.name.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    .join(", ");
}

export function compareLeadsForBrowser(
  left: LeadBrowserComparable,
  right: LeadBrowserComparable,
  sort: LeadBrowserSort,
  sortDir: LeadBrowserSortDir,
  now: Date = new Date(),
): number {
  const direction = sortDir === "asc" ? 1 : -1;
  let result = 0;

  if (sort === "fullName") {
    result = compareNullableText(left.fullName, right.fullName);
  } else if (sort === "phone") {
    result = compareNullableText(left.phone, right.phone);
  } else if (sort === "company") {
    result = compareNullableText(left.company?.name, right.company?.name);
  } else if (sort === "project") {
    result = compareNullableText(left.project?.name, right.project?.name);
  } else if (sort === "source") {
    result = compareNullableText(left.source?.label, right.source?.label);
  } else if (sort === "status") {
    result = compareNullableText(left.status?.label, right.status?.label);
  } else if (sort === "owner") {
    result = compareNullableText(ownerSortLabel(left.assignedUser), ownerSortLabel(right.assignedUser));
  } else if (sort === "age") {
    result = compareNullableTime(left.createdAt, right.createdAt);
  } else if (sort === "next") {
    result = compareNullableTime(left.nextAction?.at, right.nextAction?.at);
  } else if (sort === "urgency") {
    const leftRank = leadUrgency({ ...left, now }).sortRank;
    const rightRank = leadUrgency({ ...right, now }).sortRank;
    result = leftRank - rightRank;
  } else if (sort === "tags") {
    result = compareNullableText(tagsSortLabel(left.tagsResolved), tagsSortLabel(right.tagsResolved));
  }

  if (result === 0 && sort !== "fullName") {
    result = compareNullableText(left.fullName, right.fullName);
  }

  if (result === 0) {
    result = left.id.localeCompare(right.id);
  }

  return result * direction;
}

export function matchesLeadNextFilter(
  lead: LeadBrowserComparable,
  filter: LeadNextFilter,
  now: Date = new Date(),
): boolean {
  const nextAt = parseListDate(lead.nextAction?.at);
  if (filter === "has_next") {
    return Boolean(lead.nextAction?.title.trim());
  }
  if (filter === "no_next") {
    return !lead.nextAction?.title.trim();
  }
  if (!nextAt) {
    return false;
  }
  return nextAt.getTime() < now.getTime();
}

export function matchesLeadUrgencyFilter(
  lead: LeadBrowserComparable,
  filter: LeadUrgencyFilter,
  now: Date = new Date(),
): boolean {
  const level: LeadUrgencyLevel = leadUrgency({ ...lead, now }).level;
  if (filter === "none") {
    return level === "none";
  }
  return level === filter;
}

export function paginateLeadBrowser<T extends LeadBrowserComparable>(
  leads: T[],
  input: {
    sort?: LeadBrowserSort;
    sortDir?: LeadBrowserSortDir;
    nextFilter?: LeadNextFilter | "";
    urgencyFilter?: LeadUrgencyFilter | "";
    page?: number;
    pageSize?: number;
    now?: Date;
  } = {},
): { leads: T[]; total: number } {
  const sort = input.sort ?? "age";
  const sortDir = input.sortDir ?? defaultSortDirForLeadColumn(sort);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const now = input.now ?? new Date();

  let filtered = leads;
  const nextFilter = input.nextFilter;
  if (nextFilter) {
    filtered = filtered.filter((lead) => matchesLeadNextFilter(lead, nextFilter, now));
  }
  const urgencyFilter = input.urgencyFilter;
  if (urgencyFilter) {
    filtered = filtered.filter((lead) => matchesLeadUrgencyFilter(lead, urgencyFilter, now));
  }

  const sorted = [...filtered].sort((left, right) =>
    compareLeadsForBrowser(left, right, sort, sortDir, now),
  );
  const start = (page - 1) * pageSize;

  return {
    leads: sorted.slice(start, start + pageSize),
    total: sorted.length,
  };
}

export function needsLeadBrowserMemoryPath(input: {
  sort?: LeadBrowserSort;
  nextFilter?: string;
  urgencyFilter?: string;
}): boolean {
  const sort = input.sort ?? "age";
  if (input.nextFilter || input.urgencyFilter) {
    return true;
  }
  return !isLeadDatabaseSort(sort);
}
