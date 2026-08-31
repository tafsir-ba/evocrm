"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ImportLaunchButton } from "@/components/imports/import-launch-button";
import { PageHeader } from "@/components/layout/page-header";
import { LeadsTable, type LeadTableMember } from "@/components/leads/leads-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Select } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PROPERTY_TYPE_INTERESTS,
  PROPERTY_TYPE_INTEREST_LABELS,
  TRANSACTION_INTENTS,
  TRANSACTION_INTENT_LABELS,
  USAGE_PURPOSES,
  USAGE_PURPOSE_LABELS,
} from "@/lib/lead-preferences";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@/lib/icons";
import { useWorkspaceProjectFilter } from "@/lib/use-workspace-project-filter";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
  isDefault?: boolean;
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
  secondaryProjects?: Array<{ id: string; name: string; reference: string | null }>;
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

type LeadsPanelProps = {
  workspaceSlug: string;
  canCreate: boolean;
  canCreateProject?: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canUpdate: boolean;
};

export function LeadsPanel({
  workspaceSlug,
  canCreate,
  canCreateProject = false,
  canArchive,
  canDelete,
  canUpdate,
}: LeadsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourceIdParam = searchParams.get("sourceId") ?? "";
  const assignedToParam = searchParams.get("assignedTo") ?? "";
  const createdFromParam = searchParams.get("createdFrom");
  const createdToParam = searchParams.get("createdTo");
  const acquisitionParam = searchParams.get("acquisition");
  const projectId = useWorkspaceProjectFilter();
  const [includeAssociated, setIncludeAssociated] = useState(false);
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState(() => searchParams.get("sourceId") ?? "");
  const [assignedFilter, setAssignedFilter] = useState(() => searchParams.get("assignedTo") ?? "");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [tagFilter, setTagFilter] = useState("");
  const [integrationFilter, setIntegrationFilter] = useState("");
  const [utmCampaignFilter, setUtmCampaignFilter] = useState("");
  const [propertyTypeInterestFilter, setPropertyTypeInterestFilter] = useState("");
  const [transactionIntentFilter, setTransactionIntentFilter] = useState("");
  const [usagePurposeFilter, setUsagePurposeFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [jobTitleFilter, setJobTitleFilter] = useState("");
  const [stateRegionFilter, setStateRegionFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [sources, setSources] = useState<DictionaryItem[]>([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);
  const [websiteIntegrations, setWebsiteIntegrations] = useState<WebsiteIntegrationOption[]>(
    [],
  );
  const [websiteOptionsWarning, setWebsiteOptionsWarning] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [excludedLeadIds, setExcludedLeadIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [members, setMembers] = useState<LeadTableMember[]>([]);
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadOptions = useCallback(async () => {
    setWebsiteOptionsWarning(null);

    try {
      const [statusRes, sourceRes, tagsRes, integrationsRes, membersRes, companiesRes] =
        await Promise.all([
          fetch(`${apiBase}/dictionary-items?type=lead_status`),
          fetch(`${apiBase}/dictionary-items?type=lead_source`),
          fetch(`${apiBase}/tags?entityType=lead`),
          fetch(`${apiBase}/integrations?type=website`),
          fetch(`${apiBase}/members`),
          fetch(`${apiBase}/companies`),
        ]);

      const [
        statusPayload,
        sourcePayload,
        tagsPayload,
        integrationsPayload,
        membersPayload,
        companiesPayload,
      ] = await Promise.all([
        statusRes.json(),
        sourceRes.json(),
        tagsRes.json(),
        integrationsRes.json(),
        membersRes.json(),
        companiesRes.json(),
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
          (integrationsPayload.data.integrations as WebsiteIntegrationOption[]).map(
            (integration) => ({ id: integration.id, name: integration.name }),
          ),
        );
      } else if (integrationsRes.status === 403) {
        setWebsiteIntegrations([]);
        setWebsiteOptionsWarning(
          "Website filter unavailable — requires settings:read to list integrations.",
        );
      } else {
        setWebsiteIntegrations([]);
        setWebsiteOptionsWarning(
          integrationsPayload.error?.message ?? "Could not load website integrations for filtering.",
        );
      }
      if (membersRes.ok) {
        setMembers((membersPayload?.data?.members as LeadTableMember[] | undefined) ?? []);
      } else {
        setMembers([]);
      }
      if (companiesRes.ok) {
        setCompanies(
          ((companiesPayload?.data?.companies as Array<{ id: string; name: string }> | undefined) ??
            []) as Array<{ id: string; name: string }>,
        );
      } else {
        setCompanies([]);
      }
    } catch {
      setWebsiteOptionsWarning("Could not load some lead filter options.");
    }
  }, [apiBase]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
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
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [
    apiBase,
    page,
    pageSize,
    propertyTypeInterestFilter,
    search,
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
    projectId,
    includeAssociated,
    showArchived,
    createdFromParam,
    createdToParam,
    acquisitionParam,
  ]);

  useEffect(() => {
    setSourceFilter(sourceIdParam);
    setAssignedFilter(assignedToParam);
  }, [assignedToParam, sourceIdParam]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

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
    showArchived,
    createdFromParam,
    createdToParam,
    acquisitionParam,
  ]);

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
    if (statusFilter) {
      filters.statusId = statusFilter;
    }
    if (sourceFilter) {
      filters.sourceId = sourceFilter;
    }
    if (assignedFilter) {
      filters.assignedTo = assignedFilter;
    }
    if (createdFromParam) {
      filters.createdFrom = createdFromParam;
    }
    if (createdToParam) {
      filters.createdTo = createdToParam;
    }
    if (acquisitionParam === "genuine_inbound" || acquisitionParam === "legacy_import") {
      filters.acquisition = acquisitionParam;
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
    if (projectId) {
      filters.projectId = projectId;
    }
    if (projectId && includeAssociated) {
      filters.includeAssociated = "true";
    }
    if (showArchived) {
      filters.includeArchived = "true";
    }
    return filters;
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

    const response = await fetch(`${apiBase}/leads/${leadId}`, { method: "DELETE" });
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
  ) {
    if (!canUpdate || pendingLeadId) {
      return;
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
        return;
      }

      await loadLeads();
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
        className="shrink-0"
        title="Leads"
        meta={
          !loading ? (
            <Badge tone="muted" size="sm">
              {total} total
            </Badge>
          ) : undefined
        }
        actions={
          canCreate ? (
            <div className="flex items-center gap-2">
              <ImportLaunchButton
                workspaceSlug={workspaceSlug}
                entityType="lead"
                canCreateProject={canCreateProject}
                onComplete={() => void loadLeads()}
              />
              <Button
                leadingIcon={<IconPlus size={14} />}
                onClick={() => router.push(workspacePath(workspaceSlug, "leads", "new"))}
              >
                New lead
              </Button>
            </div>
          ) : undefined
        }
      />

      {websiteOptionsWarning && (
        <p className="mb-3 text-[12.5px] text-[var(--color-ink-muted)]">{websiteOptionsWarning}</p>
      )}

      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-1.5">
        <div className="flex-1 min-w-[200px] max-w-md">
          <Input
            placeholder="Search leads by name, email or phone…"
            aria-label="Search leads by name, email or phone"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            fieldSize="sm"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-[13px] text-[var(--color-ink-muted)]">
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
          <label className="inline-flex items-center gap-2 text-[13px] text-[var(--color-ink-muted)]">
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
        <Select
          fieldSize="sm"
          className="w-auto min-w-[140px]"
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
          className="w-auto min-w-[140px]"
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
          className="w-auto min-w-[140px]"
          aria-label="Filter by assignee"
          value={assignedFilter}
          onChange={(event) => {
            setPage(1);
            setAssignedFilter(event.target.value);
          }}
        >
          <option value="">All assigned</option>
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
                const next = new URLSearchParams(searchParams.toString());
                next.delete("createdFrom");
                next.delete("createdTo");
                next.delete("acquisition");
                const qs = next.toString();
                router.replace(
                  `${workspacePath(workspaceSlug, "leads")}${qs ? `?${qs}` : ""}`,
                );
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

      {showMoreFilters ? (
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-1.5">
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
          className="w-auto min-w-[150px] max-w-[180px]"
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
          className="w-auto min-w-[140px] max-w-[180px]"
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
          className="w-auto min-w-[140px] max-w-[180px]"
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
          className="w-auto min-w-[140px] max-w-[180px]"
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

      {loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : error ? (
        <ErrorState title="Could not load leads" description={error} primaryAction={{ label: "Retry", onClick: () => void loadLeads() }} />
      ) : leads.length === 0 ? (
        <EmptyState
          title="No leads yet"
          description="Create your first lead to start capturing demand in this workspace."
          primaryAction={
            canCreate
              ? {
                  label: "New lead",
                  onClick: () => router.push(workspacePath(workspaceSlug, "leads", "new")),
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
                <Button variant="ghost" size="sm" onClick={clearSelection} disabled={bulkDeleting}>
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

          {canDelete && allPageSelected && total > leads.length && !selectAllMatching && (
            <div className="border-b border-[var(--color-line)] bg-[#eff6ff] px-3 py-2 text-[12.5px] text-[var(--color-ink-soft)]">
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
            selectedLeadIds={selectedLeadIds}
            selectAllMatching={selectAllMatching}
            excludedLeadIds={excludedLeadIds}
            allPageSelected={allPageSelected}
            somePageSelected={somePageSelected}
            pendingLeadId={pendingLeadId}
            onToggleLead={toggleLeadSelection}
            onTogglePage={togglePageSelection}
            onAssign={(leadId, assignedTo) => void handleAssign(leadId, assignedTo)}
            onStatusChange={(leadId, statusId) => void handleStatusChange(leadId, statusId)}
            onArchive={(leadId, leadName) => void handleArchive(leadId, leadName)}
            onRestore={(leadId, leadName) => void handleRestore(leadId, leadName)}
          />

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2">
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Showing{" "}
              <span className="text-[var(--color-ink)] font-medium">
                {total === 0 ? 0 : (page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, total)}
              </span>{" "}
              of <span className="text-[var(--color-ink)] font-medium">{total}</span> leads
            </p>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-50"
                disabled={page <= 1}
                aria-label="Previous page"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <IconChevronLeft size={14} />
              </button>
              <span className="px-2 text-[12.5px] text-[var(--color-ink-soft)] tabular" aria-live="polite">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-50"
                disabled={page >= totalPages}
                aria-label="Next page"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                <IconChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
