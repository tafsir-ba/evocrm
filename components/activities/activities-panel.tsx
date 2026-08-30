"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  activityTypeIcon,
  cancelActivityRequest,
  completeActivityRequest,
  formatActivityDateTime,
  formatRelatedSummary,
} from "@/components/activities/activity-helpers";
import { MemberSelector, type MemberSelectorMember } from "@/components/domain/member-selector";
import { StatusBadge } from "@/components/domain/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Select } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconActivities,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
} from "@/lib/icons";
import { appendProjectIdToSearchParams } from "@/lib/project-scope";
import { useWorkspaceProjectFilter } from "@/lib/use-workspace-project-filter";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
  behavior?: string;
};

type ActivityListItem = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  outcome: string | null;
  type: DictionaryItem | null;
  status: DictionaryItem | null;
  lead: { id: string; fullName: string } | null;
  property: { id: string; title: string; reference: string | null } | null;
  opportunity: { id: string } | null;
  assignedUser: { id: string; name: string | null; email: string } | null;
  isOverdue: boolean;
};

type ActivitiesPanelProps = {
  workspaceSlug: string;
  workspaceTimezone: string;
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
  allowGlobalCreate?: boolean;
};

type ViewKey = "all" | "mine" | "upcoming" | "overdue";

function readViewParam(value: string | null): ViewKey {
  return value === "mine" || value === "upcoming" || value === "overdue" ? value : "all";
}

export function ActivitiesPanel({
  workspaceSlug,
  workspaceTimezone,
  canCreate,
  canUpdate,
  canArchive,
  allowGlobalCreate = false,
}: ActivitiesPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = readViewParam(searchParams.get("view"));
  const projectId = useWorkspaceProjectFilter();
  const [activities, setActivities] = useState<ActivityListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [view, setView] = useState<ViewKey>(viewParam);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [types, setTypes] = useState<DictionaryItem[]>([]);
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [members, setMembers] = useState<MemberSelectorMember[]>([]);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadOptions = useCallback(async () => {
    try {
      const [typesRes, statusesRes, membersRes] = await Promise.all([
        fetch(`${apiBase}/dictionary-items?type=activity_type`),
        fetch(`${apiBase}/dictionary-items?type=activity_status`),
        fetch(`${apiBase}/members`),
      ]);

      const [typesPayload, statusesPayload, membersPayload] = await Promise.all([
        typesRes.json(),
        statusesRes.json(),
        membersRes.json(),
      ]);

      if (typesRes.ok) {
        setTypes(typesPayload.data.items as DictionaryItem[]);
      }
      if (statusesRes.ok) {
        setStatuses(statusesPayload.data.items as DictionaryItem[]);
      }
      if (membersRes.ok) {
        setMembers(membersPayload.data.members as MemberSelectorMember[]);
      }
    } catch {
      // Non-blocking.
    }
  }, [apiBase]);

  const loadActivities = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      if (view !== "all") {
        params.set("view", view);
      }
      if (search.trim()) {
        params.set("search", search.trim());
      }
      if (typeFilter) {
        params.set("typeId", typeFilter);
      }
      if (statusFilter) {
        params.set("statusId", statusFilter);
      }
      if (assignedFilter) {
        params.set("assignedTo", assignedFilter);
      }
      appendProjectIdToSearchParams(params, projectId);

      const response = await fetch(`${apiBase}/activities?${params.toString()}`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load activities.");
      }

      setActivities(payload.data as ActivityListItem[]);
      setTotal(payload.pagination?.total ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [
    apiBase,
    assignedFilter,
    page,
    pageSize,
    projectId,
    search,
    statusFilter,
    typeFilter,
    view,
  ]);

  useEffect(() => {
    setView(viewParam);
  }, [viewParam]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  async function handleComplete(activityId: string) {
    setActionPending(activityId);
    try {
      const result = await completeActivityRequest(apiBase, activityId);
      if (!result.ok) {
        if ("message" in result) {
          window.alert(result.message);
        }
        return;
      }
      await loadActivities();
    } finally {
      setActionPending(null);
    }
  }

  async function handleCancel(activityId: string) {
    setActionPending(activityId);
    try {
      const result = await cancelActivityRequest(apiBase, activityId);
      if (!result.ok) {
        if ("message" in result) {
          window.alert(result.message);
        }
        return;
      }
      await loadActivities();
    } finally {
      setActionPending(null);
    }
  }

  async function handleArchive(activityId: string, title: string) {
    if (!window.confirm(`Archive activity "${title}"?`)) {
      return;
    }

    setActionPending(activityId);
    try {
      const response = await fetch(`${apiBase}/activities/${activityId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json();
        window.alert(body.error?.message ?? "Failed to archive activity.");
        return;
      }
      await loadActivities();
    } finally {
      setActionPending(null);
    }
  }

  function renderList(list: ActivityListItem[]) {
    if (loading) {
      return (
        <div className="space-y-1.5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      );
    }

    if (list.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-[var(--color-line-strong)] bg-white px-3 py-6 text-center">
          <span className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
            <IconActivities size={16} />
          </span>
          <p className="text-[13.5px] font-semibold text-[var(--color-ink)]">All caught up</p>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-muted)]">
            No activities match this view.
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-white divide-y divide-[var(--color-line)]">
        {list.map((activity) => (
          <div
            key={activity.id}
            className={`flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-canvas)] ${
              activity.isOverdue ? "bg-[color-mix(in_srgb,var(--color-danger-fg)_4%,white)]" : ""
            }`}
          >
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
              style={{
                background: `color-mix(in srgb, ${activity.type?.color ?? "var(--color-brand-600)"} 10%, white)`,
                color: activity.type?.color ?? "var(--color-brand-600)",
              }}
              title={activity.type?.label}
            >
              {activityTypeIcon(activity.type?.key, 14)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <p className="truncate text-[12.5px] font-semibold text-[var(--color-ink)]">
                  {activity.title}
                </p>
                {activity.isOverdue ? (
                  <span className="shrink-0 text-[11px] font-medium text-[var(--color-danger-fg)]">
                    Overdue
                  </span>
                ) : null}
              </div>
              <p className="truncate text-[11.5px] text-[var(--color-ink-muted)]">
                {formatRelatedSummary(activity)}
                {activity.dueDate
                  ? ` · ${formatActivityDateTime(activity.dueDate, workspaceTimezone)}`
                  : " · No due date"}
                {activity.assignedUser
                  ? ` · ${activity.assignedUser.name ?? activity.assignedUser.email}`
                  : ""}
                {activity.outcome ? ` · ${activity.outcome}` : ""}
              </p>
            </div>
            {activity.status ? (
              <StatusBadge
                label={activity.status.label}
                color={activity.status.color}
                behavior={activity.status.behavior}
                size="sm"
              />
            ) : null}
            <div className="flex shrink-0 items-center gap-0.5">
              {canUpdate && activity.status?.behavior === "pending" ? (
                <>
                  <button
                    type="button"
                    className="inline-flex h-6 items-center rounded px-1.5 text-[12px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-50"
                    disabled={actionPending === activity.id}
                    onClick={() => void handleComplete(activity.id)}
                  >
                    <IconCheck size={12} />
                    <span className="ml-1">Complete</span>
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-6 items-center rounded px-1.5 text-[12px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-50"
                    disabled={actionPending === activity.id}
                    onClick={() => void handleCancel(activity.id)}
                  >
                    Cancel
                  </button>
                </>
              ) : null}
              {canUpdate ? (
                <button
                  type="button"
                  className="inline-flex h-6 items-center rounded px-1.5 text-[12px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  onClick={() =>
                    router.push(workspacePath(workspaceSlug, "activities", activity.id, "edit"))
                  }
                >
                  Edit
                </button>
              ) : null}
              {canArchive ? (
                <button
                  type="button"
                  className="inline-flex h-6 items-center rounded px-1.5 text-[12px] font-medium text-[var(--color-danger-fg)] hover:bg-[var(--color-muted)] disabled:opacity-50"
                  disabled={actionPending === activity.id}
                  onClick={() => void handleArchive(activity.id, activity.title)}
                >
                  Archive
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (forbidden) {
    return (
      <PermissionDenied
        title="Activities unavailable"
        description="You do not have permission to view activities."
      />
    );
  }

  if (error && activities.length === 0 && !loading) {
    return (
      <ErrorState
        title="Could not load activities"
        description={error}
        primaryAction={{ label: "Retry", onClick: () => void loadActivities() }}
      />
    );
  }

  return (
    <>
      <PageHeader
        density="compact"
        title="Activities"
        meta={
          <Badge tone="muted" size="sm">
            {total} total
          </Badge>
        }
        actions={
          canCreate && allowGlobalCreate ? (
            <Button
              leadingIcon={<IconPlus size={14} />}
              onClick={() => router.push(workspacePath(workspaceSlug, "activities", "new"))}
            >
              New activity
            </Button>
          ) : undefined
        }
      />

      {canCreate && !allowGlobalCreate ? (
        <p className="mb-2 text-[12px] text-[var(--color-ink-muted)]">
          Create from a lead, property, or opportunity. Times in {workspaceTimezone}.
        </p>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <div
          className="inline-flex overflow-x-auto rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] p-0.5"
          role="tablist"
          aria-label="Activity views"
        >
          {(
            [
              { key: "all", label: "All" },
              { key: "mine", label: "Mine" },
              { key: "upcoming", label: "Upcoming" },
              { key: "overdue", label: "Overdue" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={view === tab.key}
              onClick={() => {
                setView(tab.key);
                setPage(1);
              }}
              className={`h-7 whitespace-nowrap rounded px-2.5 text-[12.5px] font-medium ${
                view === tab.key
                  ? "bg-white text-[var(--color-ink)] shadow-[var(--shadow-xs)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="min-w-[180px] max-w-sm flex-1">
          <Input
            placeholder="Search activities…"
            aria-label="Search activities"
            fieldSize="sm"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <button
          type="button"
          className="inline-flex h-8 items-center rounded-md border border-[var(--color-line)] bg-white px-2.5 text-[12.5px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
          aria-expanded={showMoreFilters}
          onClick={() => setShowMoreFilters((current) => !current)}
        >
          More filters
          {typeFilter || statusFilter || assignedFilter ? " · on" : ""}
        </button>
      </div>

      {showMoreFilters ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Select
            fieldSize="sm"
            className="w-auto min-w-[140px]"
            aria-label="Filter by type"
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {types.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
          <Select
            fieldSize="sm"
            className="w-auto min-w-[140px]"
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {statuses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
          <MemberSelector
            members={members}
            selectedUserId={assignedFilter || null}
            onChange={(userId) => {
              setAssignedFilter(userId ?? "");
              setPage(1);
            }}
            placeholder="All assignees"
          />
        </div>
      ) : null}

      {renderList(activities)}

      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[12px] text-[var(--color-ink-muted)]">
            Page {page} of {totalPages}
          </p>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-50"
              disabled={page <= 1}
              aria-label="Previous page"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <IconChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-50"
              disabled={page >= totalPages}
              aria-label="Next page"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              <IconChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

    </>
  );
}
