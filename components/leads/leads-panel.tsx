"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ImportLaunchButton } from "@/components/imports/import-launch-button";
import { PageHeader } from "@/components/layout/page-header";
import {
  LeadEnrichmentModal,
  type EnrichmentAppliedRun,
} from "@/components/leads/lead-enrichment-modal";
import {
  LeadsTable,
  type LeadTableMember,
  type LeadsTableColumnFilters,
} from "@/components/leads/leads-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Select } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import {
  agePresetToCreatedRange,
  isLeadAgePreset,
  isLeadNextFilter,
  isLeadUrgencyFilter,
  LEAD_BROWSER_SORT_LABELS,
  LEAD_BROWSER_SORTS,
  leadBrowserSortDirLabel,
  nextLeadBrowserSort,
  type LeadAgePreset,
  type LeadBrowserSort,
  type LeadBrowserSortDir,
  type LeadNextFilter,
  type LeadUrgencyFilter,
} from "@/lib/lead-browser";
import {
  PROPERTY_TYPE_INTERESTS,
  PROPERTY_TYPE_INTEREST_LABELS,
  TRANSACTION_INTENTS,
  TRANSACTION_INTENT_LABELS,
  USAGE_PURPOSES,
  USAGE_PURPOSE_LABELS,
} from "@/lib/lead-preferences";
import { slugifyDictionaryKey } from "@/lib/dictionary-form-helpers";
import {
  LEAD_LIST_PAGE_SIZE,
  applyLeadListQueryState,
  leadDetailHref,
  leadListHref,
  leadListQueryStatesEqual,
  nearestLeadListPage,
  readLeadListQueryState,
  sameSearchParams,
  type LeadListQueryState,
} from "@/lib/lead-list-context";
import {
  clearRememberedFocusedLead,
  noteWorkflowArrival,
  projectOverviewHref,
  readFocusedLead,
  readRememberedFocusedLead,
  rememberFocusedLead,
  rememberWorkflowStep,
  withFocusedLead,
} from "@/lib/workflow-navigation";
import { IconChevronLeft, IconChevronRight, IconMore, IconPlus } from "@/lib/icons";
import { isUniqueEnrichmentReveal } from "@/lib/lead-enrichment";
import { requestMarketEstimateAfterEnrichment } from "@/lib/lead-enrichment-followup-client";
import {
  canCreateLeadNote,
  createLeadNote,
  resolveLeadNoteActivityIds,
  type LeadNoteActivityIds,
  type LeadNoteDictionaryItem,
} from "@/lib/lead-notes-client";
import { setProjectIdInSearchParams } from "@/lib/project-scope";
import { useWorkspaceProjectFilter } from "@/lib/use-workspace-project-filter";
import { cn } from "@/lib/utils";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
  isDefault?: boolean;
  dictionaryId?: string;
};

const NEW_STATUS_COLORS = [
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#0EA5E9",
  "#84CC16",
  "#EF4444",
  "#6366F1",
];

const NO_NOTE_ACTIVITY_IDS: LeadNoteActivityIds = {
  noteTypeId: null,
  taskTypeId: null,
  completedStatusId: null,
  pendingStatusId: null,
};

type LeadListItem = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  archivedAt?: string | null;
  attributes?: Record<string, unknown> | null;
  lastContactedAt?: string | Date | null;
  status: DictionaryItem | null;
  statusId?: string;
  source: DictionaryItem | null;
  project: { id: string; name: string; reference: string | null } | null;
  secondaryProjects?: Array<{
    id: string;
    name: string;
    reference: string | null;
  }>;
  projectMemberships?: Array<{
    id: string;
    projectId: string;
    isPrimary: boolean;
    sourceOrder: number;
    project: { id: string; name: string; reference: string | null } | null;
  }>;
  tagsResolved: Array<{ id: string; name: string; color: string }>;
  assignedUser: { id: string; name: string | null; email: string } | null;
  company?: { id: string; name: string } | null;
  industry?: string | null;
  jobTitle?: string | null;
  stateRegion?: string | null;
  lastActivity?: { id: string; title: string; at: string | Date } | null;
  nextAction?: { id: string; title: string; at: string | Date } | null;
};

type WebsiteIntegrationOption = {
  id: string;
  name: string;
};

function LeadMobileActions({
  canCreate,
  canDelete,
  importButton,
  sort,
  sortDir,
  selectedCount,
  onSort,
  onSelectPage,
  onClearSelection,
}: {
  canCreate: boolean;
  canDelete: boolean;
  importButton?: ReactNode;
  sort: LeadBrowserSort;
  sortDir: LeadBrowserSortDir;
  selectedCount: number;
  onSort: (column: LeadBrowserSort) => void;
  onSelectPage: () => void;
  onClearSelection: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] focus-ring"
        aria-label="More lead actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <IconMore size={16} />
      </button>
      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div
        role="menu"
        aria-label="Lead actions"
        className={cn(
          "absolute right-0 z-50 mt-1 w-56 rounded-lg border border-[var(--color-line)] bg-white p-1.5 shadow-[var(--shadow-lg)]",
          open ? "block" : "hidden",
        )}
      >
        {canCreate ? importButton : null}
        {canDelete ? (
          <button
            type="button"
            role="menuitem"
            className="flex h-10 w-full items-center rounded-md px-2 text-left text-[13.5px] text-[var(--color-ink)] hover:bg-[var(--color-muted)]"
            onClick={() => {
              onSelectPage();
              setOpen(false);
            }}
          >
            Select all on this page
          </button>
        ) : null}
        {selectedCount > 0 ? (
          <button
            type="button"
            role="menuitem"
            className="flex h-10 w-full items-center rounded-md px-2 text-left text-[13.5px] text-[var(--color-ink)] hover:bg-[var(--color-muted)]"
            onClick={() => {
              onClearSelection();
              setOpen(false);
            }}
          >
            Clear selection
          </button>
        ) : null}
        <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase">
          Sort
        </p>
        {LEAD_BROWSER_SORTS.map((column) => {
          const active = sort === column;
          return (
            <button
              key={column}
              type="button"
              role="menuitem"
              aria-label={`Sort list by ${LEAD_BROWSER_SORT_LABELS[column]}`}
              className={cn(
                "flex h-10 w-full items-center rounded-md px-2 text-left text-[13.5px] hover:bg-[var(--color-muted)]",
                active
                  ? "font-medium text-[var(--color-brand-700)]"
                  : "text-[var(--color-ink)]",
              )}
              onClick={() => {
                onSort(column);
                setOpen(false);
              }}
            >
              {LEAD_BROWSER_SORT_LABELS[column]}
              {active ? ` · ${leadBrowserSortDirLabel(column, sortDir)}` : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LeadListPagination({
  testId,
  className,
  page,
  pageSize,
  total,
  totalPages,
  onPage,
}: {
  testId: string;
  className?: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div data-testid={testId} className={className}>
      <p className="min-w-0 truncate text-[12px] text-[var(--color-ink-muted)] md:text-[12.5px]">
        Showing{" "}
        <span className="font-medium text-[var(--color-ink)]">
          {total === 0 ? 0 : (page - 1) * pageSize + 1}–
          {Math.min(page * pageSize, total)}
        </span>{" "}
        of <span className="font-medium text-[var(--color-ink)]">{total}</span>
      </p>
      <div className="inline-flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-50 md:h-8 md:w-8"
          disabled={page <= 1}
          aria-label="Previous page"
          onClick={() => onPage(Math.max(1, page - 1))}
        >
          <IconChevronLeft size={14} />
        </button>
        <span
          className="tabular px-1.5 text-[12px] text-[var(--color-ink-soft)] md:px-2 md:text-[12.5px]"
          aria-live="polite"
        >
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-50 md:h-8 md:w-8"
          disabled={page >= totalPages}
          aria-label="Next page"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
        >
          <IconChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

type LeadsPanelProps = {
  workspaceSlug: string;
  canCreate: boolean;
  canCreateProject?: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  canManageStatuses?: boolean;
  canCreateNotes?: boolean;
  canEnrich?: boolean;
  canRequestMarketEstimate?: boolean;
  /** When set (project leads route), lock the list to this project and hide the project picker. */
  scopedProjectId?: string | null;
};

export function LeadsPanel({
  workspaceSlug,
  canCreate,
  canCreateProject = false,
  canArchive,
  canDelete,
  canUpdate,
  canManageStatuses = false,
  canCreateNotes = false,
  canEnrich = false,
  canRequestMarketEstimate = false,
  scopedProjectId = null,
}: LeadsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname() || workspacePath(workspaceSlug, "leads");
  const initialListState = readLeadListQueryState(searchParams);
  const createdFromParam = searchParams.get("createdFrom");
  const createdToParam = searchParams.get("createdTo");
  const acquisitionParam = searchParams.get("acquisition");
  const workspaceProjectId = useWorkspaceProjectFilter();
  const projectId = scopedProjectId ?? workspaceProjectId;
  const [includeAssociated, setIncludeAssociated] = useState(
    initialListState.includeAssociated,
  );
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialListState.page);
  const [pageSize] = useState(LEAD_LIST_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState(initialListState.search);
  const [phoneFilter, setPhoneFilter] = useState(initialListState.phone);
  const [statusFilter, setStatusFilter] = useState(initialListState.statusId);
  const [sourceFilter, setSourceFilter] = useState(initialListState.sourceId);
  const [assignedFilter, setAssignedFilter] = useState(
    initialListState.assignedTo,
  );
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [tagFilter, setTagFilter] = useState(initialListState.tagId);
  const [integrationFilter, setIntegrationFilter] = useState(
    initialListState.integrationId,
  );
  const [utmCampaignFilter, setUtmCampaignFilter] = useState(
    initialListState.utmCampaign,
  );
  const [propertyTypeInterestFilter, setPropertyTypeInterestFilter] = useState(
    initialListState.propertyTypeInterest,
  );
  const [transactionIntentFilter, setTransactionIntentFilter] = useState(
    initialListState.transactionIntent,
  );
  const [usagePurposeFilter, setUsagePurposeFilter] = useState(
    initialListState.usagePurpose,
  );
  const [industryFilter, setIndustryFilter] = useState(
    initialListState.industry,
  );
  const [jobTitleFilter, setJobTitleFilter] = useState(
    initialListState.jobTitle,
  );
  const [stateRegionFilter, setStateRegionFilter] = useState(
    initialListState.stateRegion,
  );
  const [companyFilter, setCompanyFilter] = useState(
    initialListState.companyId,
  );
  const [tableProjectFilter, setTableProjectFilter] = useState("");
  const [agePreset, setAgePreset] = useState<LeadAgePreset | "">(
    initialListState.agePreset,
  );
  const [nextFilter, setNextFilter] = useState<LeadNextFilter | "">(
    initialListState.nextFilter,
  );
  const [urgencyFilter, setUrgencyFilter] = useState<LeadUrgencyFilter | "">(
    initialListState.urgencyFilter,
  );
  const [sort, setSort] = useState<LeadBrowserSort>(initialListState.sort);
  const [sortDir, setSortDir] = useState<LeadBrowserSortDir>(
    initialListState.sortDir,
  );
  const [companies, setCompanies] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [sources, setSources] = useState<DictionaryItem[]>([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);
  const [websiteIntegrations, setWebsiteIntegrations] = useState<
    WebsiteIntegrationOption[]
  >([]);
  const [websiteOptionsWarning, setWebsiteOptionsWarning] = useState<
    string | null
  >(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [excludedLeadIds, setExcludedLeadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showArchived, setShowArchived] = useState(
    initialListState.includeArchived,
  );
  const [members, setMembers] = useState<LeadTableMember[]>([]);
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);
  const [noteActivityIds, setNoteActivityIds] =
    useState<LeadNoteActivityIds>(NO_NOTE_ACTIVITY_IDS);
  const [enrichLeadId, setEnrichLeadId] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [focusedLeadId, setFocusedLeadId] = useState<string | null>(() =>
    searchParams.get("focus"),
  );

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const listQuery = useMemo<LeadListQueryState>(
    () => ({
      page,
      search,
      phone: phoneFilter,
      statusId: statusFilter,
      sourceId: sourceFilter,
      assignedTo: assignedFilter,
      tagId: tagFilter,
      integrationId: integrationFilter,
      utmCampaign: utmCampaignFilter,
      propertyTypeInterest: propertyTypeInterestFilter,
      transactionIntent: transactionIntentFilter,
      usagePurpose: usagePurposeFilter,
      industry: industryFilter,
      jobTitle: jobTitleFilter,
      stateRegion: stateRegionFilter,
      companyId: companyFilter,
      agePreset,
      nextFilter,
      urgencyFilter,
      sort,
      sortDir,
      includeAssociated,
      includeArchived: showArchived,
    }),
    [
      agePreset,
      assignedFilter,
      companyFilter,
      includeAssociated,
      industryFilter,
      integrationFilter,
      jobTitleFilter,
      nextFilter,
      page,
      phoneFilter,
      propertyTypeInterestFilter,
      search,
      showArchived,
      sort,
      sortDir,
      sourceFilter,
      stateRegionFilter,
      statusFilter,
      tagFilter,
      transactionIntentFilter,
      urgencyFilter,
      usagePurposeFilter,
      utmCampaignFilter,
    ],
  );
  const listQueryRef = useRef(listQuery);
  listQueryRef.current = listQuery;
  const expectedSearch = useRef<string | null>(null);
  const seenSearch = useRef(searchParams.toString());
  const listHrefValue = useMemo(
    () =>
      leadListHref(
        pathname,
        applyLeadListQueryState(
          new URLSearchParams(searchParams.toString()),
          listQuery,
        ),
      ),
    [listQuery, pathname, searchParams],
  );

  useEffect(() => {
    noteWorkflowArrival(listHrefValue);
    const fromUrl = readFocusedLead(listHrefValue) ?? searchParams.get("focus");
    if (fromUrl) {
      setFocusedLeadId(fromUrl);
      rememberFocusedLead(listHrefValue, fromUrl);
      return;
    }
    setFocusedLeadId(readRememberedFocusedLead(listHrefValue));
  }, [listHrefValue, searchParams]);

  const openLeadHref = useCallback(
    (leadId: string) =>
      leadDetailHref(
        workspaceSlug,
        leadId,
        withFocusedLead(listHrefValue, leadId),
      ),
    [listHrefValue, workspaceSlug],
  );

  const rememberLeadOpen = useCallback(
    (leadId: string) => {
      const parent = withFocusedLead(listHrefValue, leadId);
      rememberWorkflowStep(parent);
      rememberFocusedLead(listHrefValue, leadId);
      setFocusedLeadId(leadId);
    },
    [listHrefValue],
  );

  const openNewLead = useCallback(() => {
    rememberWorkflowStep(listHrefValue);
    clearRememberedFocusedLead(listHrefValue);
    const params = new URLSearchParams();
    if (projectId) {
      params.set("projectId", projectId);
    }
    params.set("returnTo", listHrefValue);
    const path = workspacePath(workspaceSlug, "leads", "new");
    router.push(`${path}?${params.toString()}`);
  }, [listHrefValue, projectId, router, workspaceSlug]);

  const commitListSearch = useCallback(
    (next: URLSearchParams) => {
      const query = next.toString();
      expectedSearch.current = query;
      seenSearch.current = query;
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  const loadOptions = useCallback(async () => {
    setWebsiteOptionsWarning(null);

    try {
      const [
        statusRes,
        sourceRes,
        tagsRes,
        integrationsRes,
        membersRes,
        companiesRes,
        projectsRes,
      ] = await Promise.all([
        fetch(`${apiBase}/dictionary-items?type=lead_status`),
        fetch(`${apiBase}/dictionary-items?type=lead_source`),
        fetch(`${apiBase}/tags?entityType=lead`),
        fetch(`${apiBase}/integrations?type=website`),
        fetch(`${apiBase}/members`),
        fetch(`${apiBase}/companies`),
        fetch(`${apiBase}/projects?pageSize=100&sort=name&sortDir=asc`),
      ]);

      const [
        statusPayload,
        sourcePayload,
        tagsPayload,
        integrationsPayload,
        membersPayload,
        companiesPayload,
        projectsPayload,
      ] = await Promise.all([
        statusRes.json(),
        sourceRes.json(),
        tagsRes.json(),
        integrationsRes.json(),
        membersRes.json(),
        companiesRes.json(),
        projectsRes.json(),
      ]);

      if (statusRes.ok) {
        setStatuses(statusPayload.data.items as DictionaryItem[]);
      }
      if (sourceRes.ok) {
        setSources(sourcePayload.data.items as DictionaryItem[]);
      }
      if (tagsRes.ok) {
        setTags(tagsPayload.data.tags as Array<{ id: string; name: string }>);
      }
      if (integrationsRes.ok) {
        setWebsiteIntegrations(
          (
            integrationsPayload.data.integrations as WebsiteIntegrationOption[]
          ).map((integration) => ({
            id: integration.id,
            name: integration.name,
          })),
        );
      } else if (integrationsRes.status === 403) {
        setWebsiteIntegrations([]);
        setWebsiteOptionsWarning(
          "Website filter unavailable — requires settings:read to list integrations.",
        );
      } else {
        setWebsiteIntegrations([]);
        setWebsiteOptionsWarning(
          integrationsPayload.error?.message ??
            "Could not load website integrations for filtering.",
        );
      }
      if (membersRes.ok) {
        setMembers(
          (membersPayload?.data?.members as LeadTableMember[] | undefined) ??
            [],
        );
      } else {
        setMembers([]);
      }
      if (companiesRes.ok) {
        setCompanies(
          ((companiesPayload?.data?.companies as
            | Array<{ id: string; name: string }>
            | undefined) ?? []) as Array<{ id: string; name: string }>,
        );
      } else {
        setCompanies([]);
      }
      if (projectsRes.ok) {
        const projectItems =
          (projectsPayload?.data as
            | Array<{ id: string; name: string }>
            | undefined) ??
          (projectsPayload?.data?.projects as
            | Array<{ id: string; name: string }>
            | undefined) ??
          [];
        setProjects(
          projectItems.map((project) => ({
            id: project.id,
            name: project.name,
          })),
        );
      } else {
        setProjects([]);
      }
    } catch {
      setWebsiteOptionsWarning("Could not load some lead filter options.");
    }
  }, [apiBase]);

  const loadNoteActivityIds = useCallback(async () => {
    if (!canCreateNotes) {
      setNoteActivityIds(NO_NOTE_ACTIVITY_IDS);
      return;
    }

    try {
      const [typesRes, statusesRes] = await Promise.all([
        fetch(`${apiBase}/dictionary-items?type=activity_type`),
        fetch(`${apiBase}/dictionary-items?type=activity_status`),
      ]);
      if (!typesRes.ok || !statusesRes.ok) {
        setNoteActivityIds(NO_NOTE_ACTIVITY_IDS);
        return;
      }
      const [typesPayload, statusesPayload] = await Promise.all([
        typesRes.json(),
        statusesRes.json(),
      ]);
      setNoteActivityIds(
        resolveLeadNoteActivityIds(
          (typesPayload?.data?.items as LeadNoteDictionaryItem[] | undefined) ??
            [],
          (statusesPayload?.data?.items as
            | LeadNoteDictionaryItem[]
            | undefined) ?? [],
        ),
      );
    } catch {
      setNoteActivityIds(NO_NOTE_ACTIVITY_IDS);
    }
  }, [apiBase, canCreateNotes]);

  const loadLeads = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      setForbidden(false);

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
          ...buildLeadListFilters(),
        });

        const response = await fetch(`${apiBase}/leads?${params.toString()}`);
        const payload = await response.json();

        if (response.status === 403) {
          setForbidden(true);
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error?.message ?? "Failed to load leads.");
        }

        setLeads(payload.data as LeadListItem[]);
        setTotal(payload.pagination?.total ?? 0);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load.",
        );
      } finally {
        setLoading(false);
      }
    },
    [
      apiBase,
      page,
      pageSize,
      propertyTypeInterestFilter,
      search,
      phoneFilter,
      sourceFilter,
      assignedFilter,
      statusFilter,
      tagFilter,
      integrationFilter,
      utmCampaignFilter,
      transactionIntentFilter,
      usagePurposeFilter,
      industryFilter,
      jobTitleFilter,
      stateRegionFilter,
      companyFilter,
      tableProjectFilter,
      agePreset,
      nextFilter,
      urgencyFilter,
      sort,
      sortDir,
      projectId,
      includeAssociated,
      showArchived,
      createdFromParam,
      createdToParam,
      acquisitionParam,
    ],
  );

  useEffect(() => {
    const onPopState = () => {
      expectedSearch.current = null;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const current = searchParams.toString();
    if (current === seenSearch.current) {
      return;
    }
    if (
      expectedSearch.current !== null &&
      !sameSearchParams(current, expectedSearch.current)
    ) {
      return;
    }
    seenSearch.current = current;
    if (
      expectedSearch.current !== null &&
      sameSearchParams(current, expectedSearch.current)
    ) {
      expectedSearch.current = null;
      return;
    }

    const fromUrl = readLeadListQueryState(searchParams);
    if (leadListQueryStatesEqual(fromUrl, listQueryRef.current)) {
      return;
    }
    setPage(fromUrl.page);
    setSearch(fromUrl.search);
    setPhoneFilter(fromUrl.phone);
    setStatusFilter(fromUrl.statusId);
    setSourceFilter(fromUrl.sourceId);
    setAssignedFilter(fromUrl.assignedTo);
    setTagFilter(fromUrl.tagId);
    setIntegrationFilter(fromUrl.integrationId);
    setUtmCampaignFilter(fromUrl.utmCampaign);
    setPropertyTypeInterestFilter(fromUrl.propertyTypeInterest);
    setTransactionIntentFilter(fromUrl.transactionIntent);
    setUsagePurposeFilter(fromUrl.usagePurpose);
    setIndustryFilter(fromUrl.industry);
    setJobTitleFilter(fromUrl.jobTitle);
    setStateRegionFilter(fromUrl.stateRegion);
    setCompanyFilter(fromUrl.companyId);
    setAgePreset(fromUrl.agePreset);
    setNextFilter(fromUrl.nextFilter);
    setUrgencyFilter(fromUrl.urgencyFilter);
    setSort(fromUrl.sort);
    setSortDir(fromUrl.sortDir);
    setIncludeAssociated(fromUrl.includeAssociated);
    setShowArchived(fromUrl.includeArchived);
  }, [searchParams]);

  useEffect(() => {
    const next = applyLeadListQueryState(
      new URLSearchParams(searchParams.toString()),
      listQuery,
    );
    if (sameSearchParams(next, searchParams)) {
      return;
    }
    if (
      expectedSearch.current !== null &&
      !sameSearchParams(searchParams.toString(), expectedSearch.current)
    ) {
      return;
    }
    commitListSearch(next);
  }, [commitListSearch, listQuery, searchParams]);

  useEffect(() => {
    if (loading) {
      return;
    }
    const nearest = nearestLeadListPage(page, total, pageSize);
    if (nearest !== page) {
      setPage(nearest);
    }
  }, [loading, page, pageSize, total]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    void loadNoteActivityIds();
  }, [loadNoteActivityIds]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    setSelectedLeadIds(new Set());
    setSelectAllMatching(false);
    setExcludedLeadIds(new Set());
  }, [
    page,
    projectId,
    includeAssociated,
    propertyTypeInterestFilter,
    search,
    phoneFilter,
    sourceFilter,
    assignedFilter,
    statusFilter,
    tagFilter,
    integrationFilter,
    utmCampaignFilter,
    transactionIntentFilter,
    usagePurposeFilter,
    industryFilter,
    jobTitleFilter,
    stateRegionFilter,
    companyFilter,
    tableProjectFilter,
    agePreset,
    nextFilter,
    urgencyFilter,
    sort,
    sortDir,
    showArchived,
    createdFromParam,
    createdToParam,
    acquisitionParam,
  ]);

  const activeFilterCount = [
    showArchived,
    Boolean(projectId && includeAssociated),
    statusFilter,
    sourceFilter,
    assignedFilter,
    tagFilter,
    integrationFilter,
    utmCampaignFilter.trim(),
    propertyTypeInterestFilter,
    transactionIntentFilter,
    usagePurposeFilter,
    industryFilter.trim(),
    jobTitleFilter.trim(),
    stateRegionFilter.trim(),
    companyFilter,
    phoneFilter.trim(),
    tableProjectFilter,
    agePreset,
    nextFilter,
    urgencyFilter,
  ].filter(Boolean).length;

  const selectedCount = useMemo(() => {
    if (selectAllMatching) {
      return Math.max(0, total - excludedLeadIds.size);
    }
    return selectedLeadIds.size;
  }, [excludedLeadIds.size, selectAllMatching, selectedLeadIds.size, total]);

  const allPageSelected = useMemo(
    () =>
      leads.length > 0 &&
      leads.every((lead) =>
        selectAllMatching
          ? !excludedLeadIds.has(lead.id)
          : selectedLeadIds.has(lead.id),
      ),
    [excludedLeadIds, leads, selectAllMatching, selectedLeadIds],
  );

  const somePageSelected = useMemo(
    () =>
      leads.some((lead) =>
        selectAllMatching
          ? !excludedLeadIds.has(lead.id)
          : selectedLeadIds.has(lead.id),
      ),
    [excludedLeadIds, leads, selectAllMatching, selectedLeadIds],
  );

  function buildLeadListFilters(): Record<string, string> {
    const filters: Record<string, string> = {};
    if (search.trim()) {
      filters.search = search.trim();
    }
    if (phoneFilter.trim()) {
      filters.phone = phoneFilter.trim();
    }
    if (statusFilter) {
      filters.statusId = statusFilter;
    }
    if (sourceFilter) {
      filters.sourceId = sourceFilter;
    }
    if (assignedFilter) {
      filters.assignedTo = assignedFilter;
    }
    if (agePreset) {
      const ageRange = agePresetToCreatedRange(agePreset);
      if (ageRange.createdFrom) {
        filters.createdFrom = ageRange.createdFrom.toISOString();
      }
      if (ageRange.createdTo) {
        filters.createdTo = ageRange.createdTo.toISOString();
      }
    } else {
      if (createdFromParam) {
        filters.createdFrom = createdFromParam;
      }
      if (createdToParam) {
        filters.createdTo = createdToParam;
      }
      if (
        acquisitionParam === "genuine_inbound" ||
        acquisitionParam === "legacy_import"
      ) {
        filters.acquisition = acquisitionParam;
      }
    }
    if (tagFilter) {
      filters.tagId = tagFilter;
    }
    if (integrationFilter) {
      filters.integrationId = integrationFilter;
    }
    if (utmCampaignFilter.trim()) {
      filters.utmCampaign = utmCampaignFilter.trim();
    }
    if (propertyTypeInterestFilter) {
      filters.propertyTypeInterest = propertyTypeInterestFilter;
    }
    if (transactionIntentFilter) {
      filters.transactionIntent = transactionIntentFilter;
    }
    if (usagePurposeFilter) {
      filters.usagePurpose = usagePurposeFilter;
    }
    if (industryFilter.trim()) {
      filters.industry = industryFilter.trim();
    }
    if (jobTitleFilter.trim()) {
      filters.jobTitle = jobTitleFilter.trim();
    }
    if (stateRegionFilter.trim()) {
      filters.stateRegion = stateRegionFilter.trim();
    }
    if (companyFilter) {
      filters.companyId = companyFilter;
    }
    const effectiveProjectId = projectId ?? (tableProjectFilter || undefined);
    if (effectiveProjectId) {
      filters.projectId = effectiveProjectId;
    }
    if (projectId && includeAssociated) {
      filters.includeAssociated = "true";
    }
    if (showArchived) {
      filters.includeArchived = "true";
    }
    if (nextFilter) {
      filters.nextFilter = nextFilter;
    }
    if (urgencyFilter) {
      filters.urgencyFilter = urgencyFilter;
    }
    if (sort !== "age" || sortDir !== "desc") {
      filters.sort = sort;
      filters.sortDir = sortDir;
    }
    return filters;
  }

  function changeSort(nextSort: LeadBrowserSort) {
    const next = nextLeadBrowserSort(sort, sortDir, nextSort);
    setPage(1);
    setSort(next.sort);
    setSortDir(next.sortDir);
  }

  function clearListFilters() {
    setPage(1);
    setPhoneFilter("");
    setStatusFilter("");
    setSourceFilter("");
    setAssignedFilter("");
    setTagFilter("");
    setIntegrationFilter("");
    setUtmCampaignFilter("");
    setPropertyTypeInterestFilter("");
    setTransactionIntentFilter("");
    setUsagePurposeFilter("");
    setIndustryFilter("");
    setJobTitleFilter("");
    setStateRegionFilter("");
    setCompanyFilter("");
    setTableProjectFilter("");
    setAgePreset("");
    setNextFilter("");
    setUrgencyFilter("");
    setIncludeAssociated(false);
    setShowArchived(false);
  }

  function handleColumnFilterChange(patch: Partial<LeadsTableColumnFilters>) {
    setPage(1);
    if (patch.search !== undefined) {
      setSearch(patch.search);
    }
    if (patch.phone !== undefined) {
      setPhoneFilter(patch.phone);
    }
    if (patch.companyId !== undefined) {
      setCompanyFilter(patch.companyId);
    }
    if (patch.projectId !== undefined && !scopedProjectId) {
      setTableProjectFilter("");
      const next = setProjectIdInSearchParams(
        applyLeadListQueryState(new URLSearchParams(searchParams.toString()), {
          ...listQueryRef.current,
          page: 1,
        }),
        patch.projectId || null,
      );
      commitListSearch(next);
    }
    if (patch.sourceId !== undefined) {
      setSourceFilter(patch.sourceId);
    }
    if (patch.statusId !== undefined) {
      setStatusFilter(patch.statusId);
    }
    if (patch.assignedTo !== undefined) {
      setAssignedFilter(patch.assignedTo);
    }
    if (patch.agePreset !== undefined) {
      setAgePreset(isLeadAgePreset(patch.agePreset) ? patch.agePreset : "");
    }
    if (patch.nextFilter !== undefined) {
      setNextFilter(isLeadNextFilter(patch.nextFilter) ? patch.nextFilter : "");
    }
    if (patch.urgencyFilter !== undefined) {
      setUrgencyFilter(
        isLeadUrgencyFilter(patch.urgencyFilter) ? patch.urgencyFilter : "",
      );
    }
    if (patch.tagId !== undefined) {
      setTagFilter(patch.tagId);
    }
  }

  function toggleLeadSelection(leadId: string) {
    if (selectAllMatching) {
      setExcludedLeadIds((current) => {
        const next = new Set(current);
        if (next.has(leadId)) {
          next.delete(leadId);
        } else {
          next.add(leadId);
        }
        return next;
      });
      return;
    }

    setSelectedLeadIds((current) => {
      const next = new Set(current);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  }

  function togglePageSelection() {
    const pageIds = leads.map((lead) => lead.id);

    if (selectAllMatching) {
      setExcludedLeadIds((current) => {
        const next = new Set(current);
        if (allPageSelected) {
          pageIds.forEach((leadId) => next.add(leadId));
        } else {
          pageIds.forEach((leadId) => next.delete(leadId));
        }
        return next;
      });
      return;
    }

    setSelectedLeadIds((current) => {
      const next = new Set(current);
      if (allPageSelected) {
        pageIds.forEach((leadId) => next.delete(leadId));
      } else {
        pageIds.forEach((leadId) => next.add(leadId));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedLeadIds(new Set());
    setSelectAllMatching(false);
    setExcludedLeadIds(new Set());
  }

  async function handleBulkDelete() {
    if (!canDelete || selectedCount === 0 || bulkDeleting) {
      return;
    }

    const noun = selectedCount === 1 ? "lead" : "leads";
    if (
      !window.confirm(
        `Permanently delete ${selectedCount.toLocaleString()} ${noun}? This cannot be undone and will also remove related opportunities, activities, documents, and campaign enrollments.`,
      )
    ) {
      return;
    }

    setBulkDeleting(true);

    try {
      const response = await fetch(`${apiBase}/leads/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          selectAllMatching
            ? {
                selectAll: true,
                excludeLeadIds: [...excludedLeadIds],
                filters: buildLeadListFilters(),
              }
            : { leadIds: [...selectedLeadIds] },
        ),
      });
      const body = await response.json();

      if (!response.ok) {
        window.alert(body.error?.message ?? "Failed to delete leads.");
        return;
      }

      const deletedCount = Number(body.data?.deletedCount ?? 0);
      const requestedCount = Number(body.data?.requestedCount ?? selectedCount);
      if (deletedCount < requestedCount) {
        window.alert(
          `Deleted ${deletedCount.toLocaleString()} of ${requestedCount.toLocaleString()} selected leads. Some leads may have already been removed.`,
        );
      }

      clearSelection();
      await loadLeads();
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleArchive(leadId: string, leadName: string) {
    if (!canArchive) {
      return;
    }
    if (!window.confirm(`Archive lead "${leadName}"?`)) {
      return;
    }

    const response = await fetch(`${apiBase}/leads/${leadId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const body = await response.json();
      window.alert(body.error?.message ?? "Failed to archive lead.");
      return;
    }

    await loadLeads();
  }

  async function handleRestore(leadId: string, leadName: string) {
    if (!canArchive) {
      return;
    }
    if (!window.confirm(`Restore lead "${leadName}"?`)) {
      return;
    }

    const response = await fetch(`${apiBase}/leads/${leadId}/restore`, {
      method: "POST",
    });
    if (!response.ok) {
      const body = await response.json();
      window.alert(body.error?.message ?? "Failed to restore lead.");
      return;
    }

    await loadLeads();
  }

  async function patchLead(
    leadId: string,
    payload: { statusId?: string; assignedTo?: string | null },
    failureMessage: string,
  ): Promise<boolean> {
    if (!canUpdate || pendingLeadId) {
      return false;
    }

    setPendingLeadId(leadId);
    try {
      const response = await fetch(`${apiBase}/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json();
        window.alert(body.error?.message ?? failureMessage);
        return false;
      }

      await loadLeads({ silent: true });
      return true;
    } finally {
      setPendingLeadId(null);
    }
  }

  async function handleAssign(leadId: string, assignedTo: string | null) {
    await patchLead(leadId, { assignedTo }, "Failed to assign lead.");
  }

  async function handleStatusChange(leadId: string, statusId: string) {
    await patchLead(leadId, { statusId }, "Failed to update lead status.");
  }

  async function postLeadStatus(
    label: string,
    dictionaryId: string,
    key: string,
  ) {
    const response = await fetch(`${apiBase}/dictionary-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dictionaryId,
        type: "lead_status",
        label,
        key,
        color: NEW_STATUS_COLORS[statuses.length % NEW_STATUS_COLORS.length],
      }),
    });
    const body = await response.json().catch(() => null);
    return { response, body };
  }

  async function handleCreateStatus(leadId: string, label: string) {
    if (!canManageStatuses) {
      throw new Error("You do not have permission to create statuses.");
    }
    const dictionaryId = statuses.find(
      (status) => status.dictionaryId,
    )?.dictionaryId;
    if (!dictionaryId) {
      throw new Error(
        "Lead statuses are not loaded yet. Reload the page and try again.",
      );
    }

    const baseKey = slugifyDictionaryKey(label) || "status";
    const takenKeys = new Set(statuses.map((status) => status.key));
    const uniqueSuffix = () => `_${Date.now().toString(36).slice(-4)}`;
    const firstKey = takenKeys.has(baseKey)
      ? `${baseKey.slice(0, 59)}${uniqueSuffix()}`
      : baseKey;

    let { response, body } = await postLeadStatus(
      label,
      dictionaryId,
      firstKey,
    );
    if (response.status === 409 && /key/i.test(body?.error?.message ?? "")) {
      ({ response, body } = await postLeadStatus(
        label,
        dictionaryId,
        `${baseKey.slice(0, 59)}${uniqueSuffix()}`,
      ));
    }
    if (!response.ok) {
      throw new Error(body?.error?.message ?? "Could not create the status.");
    }

    const created = body.data.item as DictionaryItem;
    setStatuses((current) => [...current, created]);
    const applied = await patchLead(
      leadId,
      { statusId: created.id },
      "Status created, but the lead could not be updated.",
    );
    if (!applied) {
      throw new Error(
        `Status “${created.label}” was created but not applied to this lead. Pick it from the list.`,
      );
    }
  }

  async function handleEnriched(leadId: string, run: EnrichmentAppliedRun) {
    await loadLeads({ silent: true });
    if (!canRequestMarketEstimate || !isUniqueEnrichmentReveal(run)) {
      return;
    }
    try {
      await requestMarketEstimateAfterEnrichment({ apiBase, leadId });
    } catch {
      // The estimate is best-effort; the profile still offers it from the financial tab.
    }
  }

  async function handleAddNote(
    leadId: string,
    body: string,
    followUpIso: string | null,
  ) {
    await createLeadNote({
      apiBase,
      leadId,
      body,
      followUpIso,
      ids: noteActivityIds,
    });
    await loadLeads({ silent: true });
  }

  const mobileFilterChips: Array<{
    key: string;
    label: string;
    clear: () => void;
  }> = [];
  if (showArchived) {
    mobileFilterChips.push({
      key: "archived",
      label: "Archived",
      clear: () => {
        setPage(1);
        setShowArchived(false);
      },
    });
  }
  if (projectId && includeAssociated) {
    mobileFilterChips.push({
      key: "associated",
      label: "Associated",
      clear: () => {
        setPage(1);
        setIncludeAssociated(false);
      },
    });
  }
  if (statusFilter) {
    mobileFilterChips.push({
      key: "status",
      label:
        statuses.find((status) => status.id === statusFilter)?.label ??
        "Status",
      clear: () => {
        setPage(1);
        setStatusFilter("");
      },
    });
  }
  if (sourceFilter) {
    mobileFilterChips.push({
      key: "source",
      label:
        sources.find((source) => source.id === sourceFilter)?.label ??
        "Source",
      clear: () => {
        setPage(1);
        setSourceFilter("");
      },
    });
  }
  if (assignedFilter) {
    mobileFilterChips.push({
      key: "owner",
      label:
        assignedFilter === "unassigned"
          ? "Unassigned"
          : (members.find((member) => member.userId === assignedFilter)?.name ??
            "Owner"),
      clear: () => {
        setPage(1);
        setAssignedFilter("");
      },
    });
  }
  if (phoneFilter.trim()) {
    mobileFilterChips.push({
      key: "phone",
      label: "Phone",
      clear: () => {
        setPage(1);
        setPhoneFilter("");
      },
    });
  }
  const extraFilterCount = Math.max(
    0,
    activeFilterCount - mobileFilterChips.length,
  );

  if (forbidden) {
    return (
      <PermissionDenied
        title="Leads unavailable"
        description="You do not have permission to view leads."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        density="compact"
        bar
        hideBackOnMobile
        className="shrink-0"
        back={
          projectId
            ? {
                href: projectOverviewHref(workspaceSlug, projectId),
                label: "Back to project",
                mode: "stack",
              }
            : undefined
        }
        title="Leads"
        meta={
          !loading ? (
            <Badge tone="muted" size="sm">
              {total} total
            </Badge>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-1.5">
            {canCreate ? (
              <div className="hidden md:block">
                <ImportLaunchButton
                  workspaceSlug={workspaceSlug}
                  entityType="lead"
                  canCreateProject={canCreateProject}
                  onComplete={() => void loadLeads()}
                />
              </div>
            ) : null}
            {canCreate ? (
              <Button
                size="sm"
                leadingIcon={<IconPlus size={14} />}
                onClick={openNewLead}
              >
                New lead
              </Button>
            ) : null}
            <LeadMobileActions
              canCreate={canCreate}
              canDelete={canDelete}
              sort={sort}
              sortDir={sortDir}
              selectedCount={selectedCount}
              onSort={changeSort}
              onSelectPage={togglePageSelection}
              onClearSelection={clearSelection}
              importButton={
                <ImportLaunchButton
                  workspaceSlug={workspaceSlug}
                  entityType="lead"
                  canCreateProject={canCreateProject}
                  onComplete={() => void loadLeads()}
                />
              }
            />
          </div>
        }
      />

      {websiteOptionsWarning && (
        <p className="mb-3 text-[12.5px] text-[var(--color-ink-muted)]">
          {websiteOptionsWarning}
        </p>
      )}

      <div className="mb-1.5 flex shrink-0 flex-col gap-1.5 sm:mb-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
        <div className="flex w-full min-w-0 gap-2 sm:max-w-md sm:min-w-[200px] sm:flex-1">
          <Input
            className="min-w-0 flex-1"
            placeholder="Search name, email, or phone"
            aria-label="Search leads by name, email or phone"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            fieldSize="sm"
          />
          <button
            type="button"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-white px-3 text-[14px] font-medium text-[var(--color-ink-soft)] sm:hidden"
            aria-label={
              activeFilterCount > 0
                ? `Filters, ${activeFilterCount} active`
                : "Filters"
            }
            aria-expanded={mobileFiltersOpen}
            aria-controls="leads-filters"
            onClick={() => setMobileFiltersOpen((current) => !current)}
          >
            Filters
            {activeFilterCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-brand-600)] px-1 text-[11px] font-semibold text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>
        <div
          id="leads-filters"
          className={cn(
            "flex-col gap-2 sm:contents",
            mobileFiltersOpen ? "flex" : "hidden",
          )}
        >
          {activeFilterCount > 0 ? (
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-md px-2 text-[13px] font-medium text-[var(--color-brand-700)] hover:bg-[var(--color-brand-50)] md:h-8"
              onClick={clearListFilters}
            >
              Clear filters
            </button>
          ) : null}
          <label className="inline-flex shrink-0 items-center gap-2 text-[13px] text-[var(--color-ink-muted)]">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => {
                setPage(1);
                setShowArchived(event.target.checked);
              }}
            />
            Show archived
          </label>
          {projectId ? (
            <label className="inline-flex shrink-0 items-center gap-2 text-[13px] text-[var(--color-ink-muted)]">
              <input
                type="checkbox"
                checked={includeAssociated}
                onChange={(event) => {
                  setPage(1);
                  setIncludeAssociated(event.target.checked);
                }}
              />
              Include associated projects
            </label>
          ) : null}
          {!scopedProjectId ? (
            <Select
              fieldSize="sm"
              className="w-full min-w-0 sm:w-auto sm:min-w-[160px]"
              aria-label="Filter by project"
              value={projectId ?? ""}
              onChange={(event) => {
                setPage(1);
                setTableProjectFilter("");
                const next = setProjectIdInSearchParams(
                  applyLeadListQueryState(
                    new URLSearchParams(searchParams.toString()),
                    {
                      ...listQueryRef.current,
                      page: 1,
                    },
                  ),
                  event.target.value || null,
                );
                commitListSearch(next);
              }}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          ) : null}
          <Select
            fieldSize="sm"
            className="w-full min-w-0 sm:w-auto sm:min-w-[140px]"
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => {
              setPage(1);
              setStatusFilter(event.target.value);
            }}
          >
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label}
              </option>
            ))}
          </Select>
          <Select
            fieldSize="sm"
            className="w-full min-w-0 sm:w-auto sm:min-w-[140px]"
            aria-label="Filter by source"
            value={sourceFilter}
            onChange={(event) => {
              setPage(1);
              setSourceFilter(event.target.value);
            }}
          >
            <option value="">All sources</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </Select>
          <Select
            fieldSize="sm"
            className="w-full min-w-0 sm:w-auto sm:min-w-[140px]"
            aria-label="Filter by assignee"
            value={assignedFilter}
            onChange={(event) => {
              setPage(1);
              setAssignedFilter(event.target.value);
            }}
          >
            <option value="">All assigned</option>
            <option value="unassigned">Unassigned</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name ?? member.email}
              </option>
            ))}
          </Select>
          {createdFromParam || createdToParam ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1 text-[12px] text-[var(--color-ink-soft)]">
              {acquisitionParam === "legacy_import"
                ? "Imported in linked period"
                : acquisitionParam === "genuine_inbound"
                  ? "Genuine inbound in linked period"
                  : "Created in linked period"}
              <button
                type="button"
                className="font-medium text-[var(--color-brand-700)] hover:underline"
                onClick={() => {
                  const next = applyLeadListQueryState(
                    new URLSearchParams(searchParams.toString()),
                    listQueryRef.current,
                  );
                  next.delete("createdFrom");
                  next.delete("createdTo");
                  next.delete("acquisition");
                  commitListSearch(next);
                }}
              >
                Clear
              </button>
            </span>
          ) : null}
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-[var(--color-line)] bg-white px-2.5 text-[12.5px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
            aria-expanded={showMoreFilters}
            onClick={() => setShowMoreFilters((current) => !current)}
          >
            More filters
            {tagFilter ||
            integrationFilter ||
            utmCampaignFilter ||
            propertyTypeInterestFilter ||
            transactionIntentFilter ||
            usagePurposeFilter ||
            industryFilter ||
            jobTitleFilter ||
            stateRegionFilter ||
            companyFilter
              ? " · on"
              : ""}
          </button>
        </div>
      </div>

      {showMoreFilters ? (
        <div
          className={cn(
            "mb-3 flex-wrap items-center gap-1.5 sm:flex",
            mobileFiltersOpen ? "flex shrink-0" : "hidden",
          )}
        >
          <Select
            fieldSize="sm"
            className="w-auto min-w-[140px]"
            aria-label="Filter by tag"
            value={tagFilter}
            onChange={(event) => {
              setPage(1);
              setTagFilter(event.target.value);
            }}
          >
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
          <Select
            fieldSize="sm"
            className="w-auto min-w-[160px]"
            aria-label="Filter by website"
            value={integrationFilter}
            onChange={(event) => {
              setPage(1);
              setIntegrationFilter(event.target.value);
            }}
          >
            <option value="">All websites</option>
            {websiteIntegrations.map((integration) => (
              <option key={integration.id} value={integration.id}>
                {integration.name}
              </option>
            ))}
          </Select>
          <Input
            fieldSize="sm"
            className="w-auto max-w-[180px] min-w-[150px]"
            placeholder="UTM campaign"
            aria-label="Filter by UTM campaign"
            value={utmCampaignFilter}
            onChange={(event) => {
              setPage(1);
              setUtmCampaignFilter(event.target.value);
            }}
          />
          <Select
            fieldSize="sm"
            className="w-auto min-w-[160px]"
            aria-label="Filter by property type"
            value={propertyTypeInterestFilter}
            onChange={(event) => {
              setPage(1);
              setPropertyTypeInterestFilter(event.target.value);
            }}
          >
            <option value="">All property types</option>
            {PROPERTY_TYPE_INTERESTS.map((value) => (
              <option key={value} value={value}>
                {PROPERTY_TYPE_INTEREST_LABELS[value]}
              </option>
            ))}
          </Select>
          <Select
            fieldSize="sm"
            className="w-auto min-w-[140px]"
            aria-label="Filter by intent"
            value={transactionIntentFilter}
            onChange={(event) => {
              setPage(1);
              setTransactionIntentFilter(event.target.value);
            }}
          >
            <option value="">All intents</option>
            {TRANSACTION_INTENTS.map((value) => (
              <option key={value} value={value}>
                {TRANSACTION_INTENT_LABELS[value]}
              </option>
            ))}
          </Select>
          <Select
            fieldSize="sm"
            className="w-auto min-w-[150px]"
            aria-label="Filter by usage purpose"
            value={usagePurposeFilter}
            onChange={(event) => {
              setPage(1);
              setUsagePurposeFilter(event.target.value);
            }}
          >
            <option value="">All usage purposes</option>
            {USAGE_PURPOSES.map((value) => (
              <option key={value} value={value}>
                {USAGE_PURPOSE_LABELS[value]}
              </option>
            ))}
          </Select>
          <Select
            fieldSize="sm"
            className="w-auto min-w-[160px]"
            aria-label="Filter by company"
            value={companyFilter}
            onChange={(event) => {
              setPage(1);
              setCompanyFilter(event.target.value);
            }}
          >
            <option value="">All companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
          <Input
            fieldSize="sm"
            className="w-auto max-w-[180px] min-w-[140px]"
            placeholder="Industry"
            aria-label="Filter by industry"
            value={industryFilter}
            onChange={(event) => {
              setPage(1);
              setIndustryFilter(event.target.value);
            }}
          />
          <Input
            fieldSize="sm"
            className="w-auto max-w-[180px] min-w-[140px]"
            placeholder="Job title"
            aria-label="Filter by job title"
            value={jobTitleFilter}
            onChange={(event) => {
              setPage(1);
              setJobTitleFilter(event.target.value);
            }}
          />
          <Input
            fieldSize="sm"
            className="w-auto max-w-[180px] min-w-[140px]"
            placeholder="State / region"
            aria-label="Filter by state or region"
            value={stateRegionFilter}
            onChange={(event) => {
              setPage(1);
              setStateRegionFilter(event.target.value);
            }}
          />
        </div>
      ) : null}

      {mobileFilterChips.length > 0 || extraFilterCount > 0 ? (
        <div className="mb-1.5 flex shrink-0 items-center gap-1 overflow-x-auto md:hidden">
          {mobileFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-[var(--color-brand-200)] bg-[var(--color-brand-50)] px-2 text-[12px] font-medium text-[var(--color-brand-700)]"
              aria-label={`Clear ${chip.label} filter`}
              onClick={chip.clear}
            >
              {chip.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          {extraFilterCount > 0 ? (
            <span className="shrink-0 text-[12px] text-[var(--color-ink-muted)]">
              +{extraFilterCount} more
            </span>
          ) : null}
          <button
            type="button"
            className="shrink-0 px-1 text-[12px] font-medium text-[var(--color-brand-700)]"
            onClick={clearListFilters}
          >
            Clear
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load leads"
          description={error}
          primaryAction={{ label: "Retry", onClick: () => void loadLeads() }}
        />
      ) : leads.length === 0 ? (
        <EmptyState
          title={
            activeFilterCount > 0 ||
            search.trim() ||
            phoneFilter.trim() ||
            Boolean(projectId)
              ? "No matching leads"
              : "No leads yet"
          }
          description={
            activeFilterCount > 0 ||
            search.trim() ||
            phoneFilter.trim() ||
            Boolean(projectId)
              ? "Try clearing filters or broadening your search."
              : "Create your first lead to start capturing demand in this workspace."
          }
          primaryAction={
            canCreate &&
            !(
              activeFilterCount > 0 ||
              search.trim() ||
              phoneFilter.trim() ||
              Boolean(projectId)
            )
              ? {
                  label: "New lead",
                  onClick: openNewLead,
                }
              : undefined
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
          {canDelete && selectedCount > 0 && (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2">
              <p className="text-[12.5px] text-[var(--color-ink-soft)]">
                <span className="font-medium text-[var(--color-ink)]">
                  {selectedCount.toLocaleString()}
                </span>{" "}
                selected
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  disabled={bulkDeleting}
                >
                  Clear
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void handleBulkDelete()}
                  disabled={bulkDeleting}
                >
                  {bulkDeleting ? "Deleting…" : "Delete permanently"}
                </Button>
              </div>
            </div>
          )}

          {canDelete &&
            allPageSelected &&
            total > leads.length &&
            !selectAllMatching && (
              <div className="shrink-0 border-b border-[var(--color-line)] bg-[#eff6ff] px-3 py-2 text-[12.5px] text-[var(--color-ink-soft)]">
                All {leads.length} leads on this page are selected.{" "}
                <button
                  type="button"
                  className="font-medium text-[var(--color-brand-700)] hover:underline"
                  onClick={() => {
                    setSelectAllMatching(true);
                    setSelectedLeadIds(new Set());
                    setExcludedLeadIds(new Set());
                  }}
                >
                  Select all {total.toLocaleString()} leads
                </button>
              </div>
            )}

          <LeadsTable
            workspaceSlug={workspaceSlug}
            leads={leads}
            statuses={statuses}
            members={members}
            canUpdate={canUpdate}
            canArchive={canArchive}
            canDelete={canDelete}
            canManageStatuses={canManageStatuses}
            canAddNotes={canCreateNotes && canCreateLeadNote(noteActivityIds)}
            canEnrich={canEnrich}
            selectedLeadIds={selectedLeadIds}
            selectAllMatching={selectAllMatching}
            excludedLeadIds={excludedLeadIds}
            allPageSelected={allPageSelected}
            somePageSelected={somePageSelected}
            pendingLeadId={pendingLeadId}
            sort={sort}
            sortDir={sortDir}
            listHref={listHrefValue}
            leadHref={openLeadHref}
            focusedLeadId={focusedLeadId}
            onOpenLead={rememberLeadOpen}
            onSort={changeSort}
            columnFilters={{
              search,
              phone: phoneFilter,
              companyId: companyFilter,
              projectId: tableProjectFilter,
              sourceId: sourceFilter,
              statusId: statusFilter,
              assignedTo: assignedFilter,
              agePreset,
              nextFilter,
              urgencyFilter,
              tagId: tagFilter,
            }}
            filterOptions={{
              statuses,
              sources,
              members,
              companies,
              projects,
              tags,
              workspaceProjectId: projectId,
            }}
            onColumnFilterChange={handleColumnFilterChange}
            onToggleLead={toggleLeadSelection}
            onTogglePage={togglePageSelection}
            onAssign={(leadId, assignedTo) =>
              void handleAssign(leadId, assignedTo)
            }
            onStatusChange={(leadId, statusId) =>
              void handleStatusChange(leadId, statusId)
            }
            onCreateStatus={handleCreateStatus}
            onAddNote={handleAddNote}
            onEnrich={setEnrichLeadId}
            onArchive={(leadId, leadName) =>
              void handleArchive(leadId, leadName)
            }
            onRestore={(leadId, leadName) =>
              void handleRestore(leadId, leadName)
            }
            mobileFooter={
              <LeadListPagination
                testId="leads-pagination-mobile"
                className="flex items-center justify-between gap-2"
                page={page}
                pageSize={pageSize}
                total={total}
                totalPages={totalPages}
                onPage={setPage}
              />
            }
          />

          <LeadListPagination
            testId="leads-pagination"
            className="hidden shrink-0 items-center justify-between gap-3 border-t border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2 md:flex"
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPage={setPage}
          />
        </div>
      )}

      {canEnrich && enrichLeadId ? (
        <LeadEnrichmentModal
          key={enrichLeadId}
          open
          onClose={() => setEnrichLeadId(null)}
          workspaceSlug={workspaceSlug}
          leadId={enrichLeadId}
          onApplied={(run) => void handleEnriched(enrichLeadId, run)}
        />
      ) : null}
    </div>
  );
}
