"use client";

import { useCallback, useEffect, useState } from "react";

import {
  activityTypeIcon,
  cancelActivityRequest,
  completeActivityRequest,
  formatActivityDateTime,
  formatRelatedSummary,
} from "@/components/activities/activity-helpers";
import { ActivityFormDrawer } from "@/components/activities/activity-form-drawer";
import { Timeline } from "@/components/domain/timeline";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { IconCheck, IconPlus } from "@/lib/icons";

type ActivityListItem = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  outcome: string | null;
  type: { id: string; label: string; color: string; key: string; behavior?: string } | null;
  status: { id: string; label: string; color: string; key: string; behavior?: string } | null;
  lead: { id: string; fullName: string } | null;
  property: { id: string; title: string; reference: string | null } | null;
  opportunity: { id: string } | null;
  assignedUser: { id: string; name: string | null; email: string } | null;
  isOverdue: boolean;
};

type ActivitiesSectionProps = {
  workspaceSlug: string;
  workspaceTimezone: string;
  leadId?: string;
  propertyId?: string;
  opportunityId?: string;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
  compact?: boolean;
};

export function ActivitiesSection({
  workspaceSlug,
  workspaceTimezone,
  leadId,
  propertyId,
  opportunityId,
  canRead,
  canCreate,
  canUpdate,
  canArchive,
  compact = false,
}: ActivitiesSectionProps) {
  const [activities, setActivities] = useState<ActivityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const loadActivities = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ pageSize: "50" });
      if (leadId) params.set("leadId", leadId);
      if (propertyId) params.set("propertyId", propertyId);
      if (opportunityId) params.set("opportunityId", opportunityId);

      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/activities?${params.toString()}`,
      );

      if (response.status === 403) {
        setActivities([]);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to load activities.");
      }

      const body = (await response.json()) as { data: ActivityListItem[] };
      setActivities(body.data);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load activities.",
      );
    } finally {
      setLoading(false);
    }
  }, [canRead, leadId, opportunityId, propertyId, workspaceSlug]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  async function handleComplete(activityId: string) {
    setActionPending(activityId);
    try {
      const result = await completeActivityRequest(
        `/api/workspaces/${workspaceSlug}`,
        activityId,
      );
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
      const result = await cancelActivityRequest(
        `/api/workspaces/${workspaceSlug}`,
        activityId,
      );
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
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/activities/${activityId}`,
        { method: "DELETE" },
      );
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

  if (!canRead) {
    return (
      <div className="px-5 pb-5">
        <EmptyState
          title="Activities unavailable"
          description="You do not have permission to view activities."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-5 pb-5 space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-5 pb-5">
        <ErrorState
          title="Could not load activities"
          description={error}
          primaryAction={{ label: "Retry", onClick: () => void loadActivities() }}
        />
      </div>
    );
  }

  return (
    <div className="px-5 pb-5">
      {canCreate && (
        <div className="mb-4 flex justify-end">
          <Button
            size="sm"
            leadingIcon={<IconPlus size={13} />}
            onClick={() => {
              setEditId(null);
              setDrawerOpen(true);
            }}
          >
            New activity
          </Button>
        </div>
      )}

      {activities.length === 0 ? (
        <EmptyState
          title="No activities yet"
          description="Follow-up tasks, calls, and notes will appear here."
          primaryAction={
            canCreate
              ? {
                  label: "Create activity",
                  onClick: () => {
                    setEditId(null);
                    setDrawerOpen(true);
                  },
                }
              : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {!compact && (
            <div className="bg-white border border-[var(--color-line)] rounded-xl divide-y divide-[var(--color-line)] overflow-hidden">
              {activities.map((activity) => (
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
                  >
                    {activityTypeIcon(activity.type?.key)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13.5px] font-semibold text-[var(--color-ink)] truncate">
                        {activity.title}
                      </p>
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
                  </div>
                  {activity.status && (
                    <StatusBadge
                      label={activity.status.label}
                      color={activity.status.color}
                      behavior={activity.status.behavior}
                      size="sm"
                    />
                  )}
                  <div className="flex items-center gap-1">
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
                        onClick={() => {
                          setEditId(activity.id);
                          setDrawerOpen(true);
                        }}
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
          )}

          <Timeline
            items={activities.map((activity) => {
              const dateLabel = activity.completedAt
                ? `Completed ${formatActivityDateTime(activity.completedAt, workspaceTimezone)}`
                : activity.cancelledAt
                  ? `Cancelled ${formatActivityDateTime(activity.cancelledAt, workspaceTimezone)}`
                  : activity.dueDate
                    ? `Due ${formatActivityDateTime(activity.dueDate, workspaceTimezone)}`
                    : "No due date";

              return {
                id: activity.id,
                title: activity.title,
                subtitle: [
                  activity.type?.label,
                  dateLabel,
                  activity.outcome ? `Outcome: ${activity.outcome}` : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
                trailing: (
                  <div className="flex items-center gap-1 shrink-0">
                    {activity.status && (
                      <StatusBadge
                        label={activity.status.label}
                        color={activity.status.color}
                        behavior={activity.status.behavior}
                        size="sm"
                      />
                    )}
                    {compact && canUpdate && activity.status?.behavior === "pending" && (
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
                    {compact && canUpdate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditId(activity.id);
                          setDrawerOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                    {compact && canArchive && (
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
                ),
              };
            })}
          />
        </div>
      )}

      <ActivityFormDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditId(null);
        }}
        workspaceSlug={workspaceSlug}
        workspaceTimezone={workspaceTimezone}
        context={{ leadId, propertyId, opportunityId }}
        activityId={editId ?? undefined}
        onSaved={() => void loadActivities()}
      />
    </div>
  );
}
