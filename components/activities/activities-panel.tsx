"use client";

import { useRouter } from "next/navigation";
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

export function ActivitiesPanel({
  workspaceSlug,
  workspaceTimezone,
  canCreate,
  canUpdate,
  canArchive,
  allowGlobalCreate = false,
}: ActivitiesPanelProps) {
  const router = useRouter();
  const projectId = useWorkspaceProjectFilter();
  const [activities, setActivities] = useState<ActivityListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [view, setView] = useState<ViewKey>("all");
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
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      );
    }

    if (list.length === 0) {
      return (
        <div className="bg-white border border-dashed border-[var(--color-line-strong)] rounded-xl py-12 text-center dot-grid">
          <span className="inline-flex w-12 h-12 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-600)] mb-3">
            <IconActivities size={20} />
          </span>
          <p className="text-[14.5px] font-semibold text-[var(--color-ink)]">All caught up</p>
          <p className="text-[13px] text-[var(--color-ink-muted)] mt-1">
            No activities match this view.
          </p>
        </div>
      );
    }

    return (
      <div className="bg-white border border-[var(--color-line)] rounded-xl divide-y divide-[var(--color-line)] overflow-hidden">
        {list.map((activity) => (
          <div
            key={activity.id}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--color-canvas)] transition-colors"
          >
            <span
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
              style={{
                background: `color-mix(in srgb, ${activity.type?.color ?? "var(--color-brand-600)"} 10%, white)`,
                color: activity.type?.color ?? "var(--color-brand-600)",
              }}
              title={activity.type?.label}
            >
              {activityTypeIcon(activity.type?.key)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13.5px] font-semibold text-[var(--color-ink)] truncate">
                  {activity.title}
                </p>
                {activity.type && (
                  <Badge tone="muted" size="sm">
                    {activity.type.label}
                  </Badge>
                )}
                {activity.isOverdue && (
                  <span className="text-[11px] font-medium text-[var(--color-danger-fg)]">
                    Overdue
                  </span>
                )}
              </div>
              <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5 truncate">
                {formatRelatedSummary(activity)} ·{" "}
                {activity.dueDate
                  ? formatActivityDateTime(activity.dueDate, workspaceTimezone)
                  : "No due date"}
              </p>
              {activity.outcome && (
                <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5 truncate">
                  Outcome: {activity.outcome}
                </p>
              )}
            </div>
            <div className="hidden md:block text-[12px] text-[var(--color-ink-muted)] shrink-0">
              {activity.assignedUser?.name ?? activity.assignedUser?.email ?? "—"}
            </div>
            {activity.status && (
              <StatusBadge
                label={activity.status.label}
                color={activity.status.color}
                behavior={activity.status.behavior}
                size="sm"
              />
            )}
            <div className="flex items-center gap-1 shrink-0">
              {canUpdate && activity.status?.behavior === "pending" && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    leadingIcon={<IconCheck size={12} />}
                    disabled={actionPending === activity.id}
                    onClick={() => void handleComplete(activity.id)}
                  >
                    Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={actionPending === activity.id}
                    onClick={() => void handleCancel(activity.id)}
                  >
                    Cancel
                  </Button>
                </>
              )}
              {canUpdate && (
                <Button
                  size="sm"
                  variant="ghost"
                    onClick={() =>
                      router.push(
                        workspacePath(workspaceSlug, "activities", activity.id, "edit"),
                      )
                    }
                >
                  Edit
                </Button>
              )}
              {canArchive && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={actionPending === activity.id}
                  onClick={() => void handleArchive(activity.id, activity.title)}
                >
                  Archive
                </Button>
              )}
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
        title="Activities"
        description="Calls, emails, meetings, visits, tasks and notes — your daily follow-up board."
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

      {canCreate && !allowGlobalCreate && (
        <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-4 py-3 text-[13px] text-[var(--color-ink-muted)]">
          Create activities from a Lead, Property, or Opportunity detail page. Dates are
          shown in workspace timezone ({workspaceTimezone}).
        </div>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <Input
          placeholder="Search activities…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Select
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

      <div className="flex items-center gap-1 border-b border-[var(--color-line)] overflow-x-auto mb-5">
        {(
          [
            { key: "all", label: "All" },
            { key: "mine", label: "Mine" },
            { key: "upcoming", label: "Upcoming" },
            { key: "overdue", label: "Overdue" },
          ] as const
        ).map((tab) => {
          const isActive = view === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setView(tab.key);
                setPage(1);
              }}
              className={`relative h-10 px-3 inline-flex items-center text-[13.5px] font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "text-[var(--color-ink)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {tab.label}
              {isActive && (
                <span className="absolute left-2 right-2 -bottom-px h-[2px] bg-[var(--color-brand-600)] rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {renderList(activities)}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[12px] text-[var(--color-ink-muted)]">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<IconChevronLeft size={14} />}
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              trailingIcon={<IconChevronRight size={14} />}
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

    </>
  );
}
