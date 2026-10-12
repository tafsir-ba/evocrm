import {
  isLeadAgePreset,
  isLeadBrowserSort,
  isLeadNextFilter,
  isLeadUrgencyFilter,
  readLeadBrowserSort,
  readLeadBrowserSortDir,
  type LeadAgePreset,
  type LeadBrowserSort,
  type LeadBrowserSortDir,
  type LeadNextFilter,
  type LeadUrgencyFilter,
} from "@/lib/lead-browser";
import { appendReturnTo, withoutFocus } from "@/lib/workflow-navigation";
import { workspacePath } from "@/lib/workspace-paths";

export const LEAD_LIST_PAGE_SIZE = 25;

/** Query keys this list owns. Project scope and acquisition deep links stay untouched. */
const MANAGED_KEYS = [
  "page",
  "search",
  "phone",
  "statusId",
  "sourceId",
  "assignedTo",
  "tagId",
  "integrationId",
  "utmCampaign",
  "propertyTypeInterest",
  "transactionIntent",
  "usagePurpose",
  "industry",
  "jobTitle",
  "stateRegion",
  "companyId",
  "age",
  "next",
  "urgency",
  "sort",
  "dir",
  "sortDir",
  "includeAssociated",
  "archived",
] as const;

export type LeadListQueryState = {
  page: number;
  search: string;
  phone: string;
  statusId: string;
  sourceId: string;
  assignedTo: string;
  tagId: string;
  integrationId: string;
  utmCampaign: string;
  propertyTypeInterest: string;
  transactionIntent: string;
  usagePurpose: string;
  industry: string;
  jobTitle: string;
  stateRegion: string;
  companyId: string;
  agePreset: LeadAgePreset | "";
  nextFilter: LeadNextFilter | "";
  urgencyFilter: LeadUrgencyFilter | "";
  sort: LeadBrowserSort;
  sortDir: LeadBrowserSortDir;
  includeAssociated: boolean;
  includeArchived: boolean;
};

function readPage(value: string | null): number {
  const raw = Number(value);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

function readFlag(value: string | null): boolean {
  return value === "1" || value === "true";
}

export function readLeadListQueryState(
  searchParams: URLSearchParams | { get(name: string): string | null },
): LeadListQueryState {
  const ageRaw = searchParams.get("age");
  const nextRaw = searchParams.get("next");
  const urgencyRaw = searchParams.get("urgency");
  const sortRaw = searchParams.get("sort");

  return {
    page: readPage(searchParams.get("page")),
    search: searchParams.get("search") ?? "",
    phone: searchParams.get("phone") ?? "",
    statusId: searchParams.get("statusId") ?? "",
    sourceId: searchParams.get("sourceId") ?? "",
    assignedTo: searchParams.get("assignedTo") ?? "",
    tagId: searchParams.get("tagId") ?? "",
    integrationId: searchParams.get("integrationId") ?? "",
    utmCampaign: searchParams.get("utmCampaign") ?? "",
    propertyTypeInterest: searchParams.get("propertyTypeInterest") ?? "",
    transactionIntent: searchParams.get("transactionIntent") ?? "",
    usagePurpose: searchParams.get("usagePurpose") ?? "",
    industry: searchParams.get("industry") ?? "",
    jobTitle: searchParams.get("jobTitle") ?? "",
    stateRegion: searchParams.get("stateRegion") ?? "",
    companyId: searchParams.get("companyId") ?? "",
    agePreset: isLeadAgePreset(ageRaw) ? ageRaw : "",
    nextFilter: isLeadNextFilter(nextRaw) ? nextRaw : "",
    urgencyFilter: isLeadUrgencyFilter(urgencyRaw) ? urgencyRaw : "",
    sort: isLeadBrowserSort(sortRaw) ? sortRaw : readLeadBrowserSort(sortRaw),
    sortDir: readLeadBrowserSortDir(
      searchParams.get("dir") ?? searchParams.get("sortDir"),
    ),
    includeAssociated: readFlag(searchParams.get("includeAssociated")),
    includeArchived: readFlag(searchParams.get("archived")),
  };
}

function setIfPresent(
  params: URLSearchParams,
  key: string,
  value: string,
): void {
  const trimmed = value.trim();
  if (trimmed) {
    params.set(key, trimmed);
  }
}

/**
 * Writes list state onto a copy of the current query.
 * Preserves projectId and acquisition deep links (createdFrom, createdTo, acquisition).
 */
export function applyLeadListQueryState(
  current: URLSearchParams,
  state: LeadListQueryState,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  for (const key of MANAGED_KEYS) {
    next.delete(key);
  }

  if (state.page > 1) {
    next.set("page", String(state.page));
  }
  setIfPresent(next, "search", state.search);
  setIfPresent(next, "phone", state.phone);
  setIfPresent(next, "statusId", state.statusId);
  setIfPresent(next, "sourceId", state.sourceId);
  setIfPresent(next, "assignedTo", state.assignedTo);
  setIfPresent(next, "tagId", state.tagId);
  setIfPresent(next, "integrationId", state.integrationId);
  setIfPresent(next, "utmCampaign", state.utmCampaign);
  setIfPresent(next, "propertyTypeInterest", state.propertyTypeInterest);
  setIfPresent(next, "transactionIntent", state.transactionIntent);
  setIfPresent(next, "usagePurpose", state.usagePurpose);
  setIfPresent(next, "industry", state.industry);
  setIfPresent(next, "jobTitle", state.jobTitle);
  setIfPresent(next, "stateRegion", state.stateRegion);
  setIfPresent(next, "companyId", state.companyId);
  if (state.agePreset) {
    next.set("age", state.agePreset);
  }
  if (state.nextFilter) {
    next.set("next", state.nextFilter);
  }
  if (state.urgencyFilter) {
    next.set("urgency", state.urgencyFilter);
  }
  if (state.sort !== "age" || state.sortDir !== "desc") {
    next.set("sort", state.sort);
    next.set("dir", state.sortDir);
  }
  if (state.includeAssociated) {
    next.set("includeAssociated", "1");
  }
  if (state.includeArchived) {
    next.set("archived", "1");
  }

  return next;
}

export function sameSearchParams(
  left: URLSearchParams | string,
  right: URLSearchParams | string,
): boolean {
  const a = typeof left === "string" ? new URLSearchParams(left) : left;
  const b = typeof right === "string" ? new URLSearchParams(right) : right;
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    const leftValues = a.getAll(key);
    const rightValues = b.getAll(key);
    if (leftValues.length !== rightValues.length) {
      return false;
    }
    for (let index = 0; index < leftValues.length; index += 1) {
      if (leftValues[index] !== rightValues[index]) {
        return false;
      }
    }
  }
  return true;
}

export function leadListQueryStatesEqual(
  left: LeadListQueryState,
  right: LeadListQueryState,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function leadListHref(
  pathname: string,
  search: URLSearchParams,
): string {
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function leadDetailHref(
  workspaceSlug: string,
  leadId: string,
  listHref: string,
): string {
  const params = new URLSearchParams();
  params.set("returnTo", listHref);
  return `${workspacePath(workspaceSlug, "leads", leadId)}?${params.toString()}`;
}

/** Edit's parent is the lead record, which still carries the list returnTo. */
export function leadEditHref(
  workspaceSlug: string,
  leadId: string,
  parentHref: string | null,
): string {
  const path = workspacePath(workspaceSlug, "leads", leadId, "edit");
  if (!parentHref) {
    return path;
  }
  return appendReturnTo(path, parentHref);
}

/**
 * Accepts only same-workspace lead list URLs (all leads, or any project's leads).
 * Detail pages and external URLs are rejected so returnTo cannot be used as an open redirect.
 */
export function readSafeLeadListReturnTo(
  value: string | null | undefined,
  workspaceSlug: string,
): string | null {
  if (!value || !workspaceSlug.trim()) {
    return null;
  }
  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\")
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed, "http://lead-list.invalid");
  } catch {
    return null;
  }
  if (
    url.origin !== "http://lead-list.invalid" ||
    url.username ||
    url.password
  ) {
    return null;
  }

  const prefix = `/w/${workspaceSlug}/`;
  if (!url.pathname.startsWith(prefix)) {
    return null;
  }
  const rest = url.pathname.slice(prefix.length);
  if (rest !== "leads" && !/^projects\/[^/]+\/leads$/.test(rest)) {
    return null;
  }

  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

/** Page to show after a delete shrinks the list. Empty results stay on page 1. */
export function nearestLeadListPage(
  requestedPage: number,
  total: number,
  pageSize: number = LEAD_LIST_PAGE_SIZE,
): number {
  const size = Math.max(1, pageSize);
  const pages = Math.max(1, Math.ceil(Math.max(0, total) / size));
  const requested = Number.isFinite(requestedPage)
    ? Math.floor(requestedPage)
    : 1;
  if (requested < 1) {
    return 1;
  }
  if (requested > pages) {
    return pages;
  }
  return requested;
}

const SCROLL_PREFIX = "evocrm:lead-list-scroll:";

function scrollStorageKey(listHref: string): string {
  return SCROLL_PREFIX + withoutFocus(listHref);
}

export function saveLeadListScroll(listHref: string, scrollTop: number): void {
  if (typeof sessionStorage === "undefined" || !listHref) {
    return;
  }
  sessionStorage.setItem(
    scrollStorageKey(listHref),
    String(Math.max(0, Math.round(scrollTop))),
  );
}

export function readLeadListScroll(listHref: string): number | null {
  if (typeof sessionStorage === "undefined" || !listHref) {
    return null;
  }
  const raw = sessionStorage.getItem(scrollStorageKey(listHref));
  if (raw == null) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
