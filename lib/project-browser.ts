import { parseListDate } from "@/lib/list-view";
import { projectListStatus, type ProjectListStatus } from "@/lib/projects-table";

export const PROJECT_BROWSER_PAGE_SIZE = 25;
export const PROJECT_BROWSER_PICKER_PAGE_SIZE = 50;

export const PROJECT_BROWSER_VIEWS = [
  "all",
  "active",
  "stale",
  "needs_attention",
  "archived",
] as const;

export const PROJECT_BROWSER_SORTS = ["inbound", "leads", "status", "name"] as const;

export type ProjectBrowserView = (typeof PROJECT_BROWSER_VIEWS)[number];
export type ProjectBrowserSort = (typeof PROJECT_BROWSER_SORTS)[number];
export type ProjectBrowserSortDir = "asc" | "desc";

export type ProjectBrowserItem = {
  id: string;
  name: string;
  archivedAt?: string | Date | null;
  counts?: {
    leads?: number;
    lastGenuineInboundAt?: string | Date | null;
  } | null;
};

export const PROJECT_BROWSER_VIEW_LABELS: Record<ProjectBrowserView, string> = {
  all: "All",
  active: "Active",
  stale: "Stale",
  needs_attention: "Needs attention",
  archived: "Archived",
};

export function isProjectBrowserView(value: string | null | undefined): value is ProjectBrowserView {
  return PROJECT_BROWSER_VIEWS.includes(value as ProjectBrowserView);
}

export function isProjectBrowserSort(value: string | null | undefined): value is ProjectBrowserSort {
  return PROJECT_BROWSER_SORTS.includes(value as ProjectBrowserSort);
}

export function readProjectBrowserView(value: string | null | undefined): ProjectBrowserView {
  return isProjectBrowserView(value) ? value : "all";
}

export function readProjectBrowserSort(value: string | null | undefined): ProjectBrowserSort {
  return isProjectBrowserSort(value) ? value : "inbound";
}

export function readProjectBrowserSortDir(
  value: string | null | undefined,
): ProjectBrowserSortDir {
  return value === "asc" || value === "desc" ? value : "desc";
}

export function defaultSortDirForColumn(sort: ProjectBrowserSort): ProjectBrowserSortDir {
  return sort === "name" || sort === "status" ? "asc" : "desc";
}

export function nextProjectBrowserSort(
  currentSort: ProjectBrowserSort,
  currentDir: ProjectBrowserSortDir,
  nextSort: ProjectBrowserSort,
): { sort: ProjectBrowserSort; sortDir: ProjectBrowserSortDir } {
  if (currentSort === nextSort) {
    return { sort: nextSort, sortDir: currentDir === "asc" ? "desc" : "asc" };
  }

  return { sort: nextSort, sortDir: defaultSortDirForColumn(nextSort) };
}

export function matchesProjectBrowserView(
  project: ProjectBrowserItem,
  view: ProjectBrowserView,
  now?: Date,
): boolean {
  const status = projectListStatus({
    archivedAt: project.archivedAt,
    lastGenuineInboundAt: project.counts?.lastGenuineInboundAt,
    now,
  });

  if (view === "archived") {
    return Boolean(project.archivedAt);
  }

  if (project.archivedAt) {
    return false;
  }

  if (view === "active") {
    return status.label === "Active";
  }
  if (view === "stale") {
    return status.label === "Stale";
  }
  if (view === "needs_attention") {
    return status.label === "Stale" || status.label === "Unknown";
  }

  return true;
}

function statusSortRank(label: ProjectListStatus["label"]): number {
  if (label === "Stale") {
    return 0;
  }
  if (label === "Unknown") {
    return 1;
  }
  if (label === "Active") {
    return 2;
  }
  return 3;
}

export function compareProjectsForBrowser(
  left: ProjectBrowserItem,
  right: ProjectBrowserItem,
  sort: ProjectBrowserSort,
  sortDir: ProjectBrowserSortDir,
  now?: Date,
): number {
  const direction = sortDir === "asc" ? 1 : -1;
  let result = 0;

  if (sort === "name") {
    result = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  } else if (sort === "leads") {
    result = (left.counts?.leads ?? 0) - (right.counts?.leads ?? 0);
  } else if (sort === "status") {
    const leftStatus = projectListStatus({
      archivedAt: left.archivedAt,
      lastGenuineInboundAt: left.counts?.lastGenuineInboundAt,
      now,
    }).label;
    const rightStatus = projectListStatus({
      archivedAt: right.archivedAt,
      lastGenuineInboundAt: right.counts?.lastGenuineInboundAt,
      now,
    }).label;
    result = statusSortRank(leftStatus) - statusSortRank(rightStatus);
  } else {
    const leftInbound = parseListDate(left.counts?.lastGenuineInboundAt)?.getTime() ?? null;
    const rightInbound = parseListDate(right.counts?.lastGenuineInboundAt)?.getTime() ?? null;
    if (leftInbound === null && rightInbound === null) {
      result = 0;
    } else if (leftInbound === null) {
      result = 1;
    } else if (rightInbound === null) {
      result = -1;
    } else {
      result = leftInbound - rightInbound;
    }
  }

  if (result === 0 && sort !== "name") {
    result = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  }

  if (sort === "inbound" && result !== 0) {
    const leftInbound = parseListDate(left.counts?.lastGenuineInboundAt);
    const rightInbound = parseListDate(right.counts?.lastGenuineInboundAt);
    if (leftInbound && rightInbound) {
      return result * direction;
    }
    return result;
  }

  return result * direction;
}

export function paginateProjectBrowser<T extends ProjectBrowserItem>(
  projects: T[],
  input: {
    view?: ProjectBrowserView;
    sort?: ProjectBrowserSort;
    sortDir?: ProjectBrowserSortDir;
    page?: number;
    pageSize?: number;
    now?: Date;
  } = {},
): { projects: T[]; total: number } {
  const view = input.view ?? "all";
  const sort = input.sort ?? "inbound";
  const sortDir = input.sortDir ?? defaultSortDirForColumn(sort);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? PROJECT_BROWSER_PAGE_SIZE));

  const filtered = projects.filter((project) =>
    matchesProjectBrowserView(project, view, input.now),
  );
  const sorted = [...filtered].sort((left, right) =>
    compareProjectsForBrowser(left, right, sort, sortDir, input.now),
  );
  const start = (page - 1) * pageSize;

  return {
    projects: sorted.slice(start, start + pageSize),
    total: sorted.length,
  };
}

export function canPaginateProjectsInDatabase(input: {
  view?: ProjectBrowserView;
  sort?: ProjectBrowserSort;
  withCounts?: boolean;
}): boolean {
  const view = input.view ?? "all";
  return (
    !input.withCounts &&
    (view === "all" || view === "archived") &&
    (input.sort ?? "name") === "name"
  );
}
