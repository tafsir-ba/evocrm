"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { MemberSelector, type MemberSelectorMember } from "@/components/domain/member-selector";
import { StatusBadge } from "@/components/domain/status-badge";
import { TagSelector, type TagSelectorTag } from "@/components/domain/tag-selector";
import { LostReasonModal } from "@/components/opportunities/lost-reason-modal";
import { ActivitiesSection } from "@/components/activities/activities-section";
import { PageHeader } from "@/components/layout/page-header";
import { StateView } from "@/components/states/state-view";
import { Avatar, AvatarWithName } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import {
  isTerminalLostBehavior,
  isTerminalOpportunityBehavior,
  isTerminalWonBehavior,
} from "@/lib/dictionary-form-helpers";
import { formatDate, formatPrice } from "@/lib/format-price";
import { IconCheck } from "@/lib/icons";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
  behavior?: string;
};

function userInitials(name: string | null | undefined, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return email.slice(0, 2).toUpperCase();
}

type OpportunityDetail = {
  id: string;
  value: number | null;
  currency: string;
  probability: number | null;
  expectedCloseDate: string | null;
  notes: string | null;
  createdAt: string;
  closedAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReasonText: string | null;
  statusId: string;
  status: DictionaryItem | null;
  lostReason: DictionaryItem | null;
  lead: { id: string; fullName: string; email: string | null; phone: string | null } | null;
  property: {
    id: string;
    title: string;
    reference: string | null;
    price: number | null;
    currency: string;
  } | null;
  tagsResolved: Array<{ id: string; name: string; color: string }>;
  assignedUser: { id: string; name: string | null; email: string } | null;
  ownerUser: { id: string; name: string | null; email: string } | null;
};

type OpportunityDetailPanelProps = {
  workspaceSlug: string;
  opportunityId: string;
  canUpdate: boolean;
  canArchive: boolean;
  canReadActivities: boolean;
  canCreateActivity: boolean;
  canUpdateActivity: boolean;
  canArchiveActivity: boolean;
};

export function OpportunityDetailPanel({
  workspaceSlug,
  opportunityId,
  canUpdate,
  canArchive,
  canReadActivities,
  canCreateActivity,
  canUpdateActivity,
  canArchiveActivity,
}: OpportunityDetailPanelProps) {
  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [stages, setStages] = useState<DictionaryItem[]>([]);
  const [lostReasons, setLostReasons] = useState<Array<{ id: string; label: string }>>([]);
  const [tags, setTags] = useState<TagSelectorTag[]>([]);
  const [members, setMembers] = useState<MemberSelectorMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stagePending, setStagePending] = useState(false);
  const [lostModal, setLostModal] = useState<string | null>(null);
  const [form, setForm] = useState({
    value: "",
    currency: "",
    expectedCloseDate: "",
    notes: "",
    assignedTo: "",
    tagIds: [] as string[],
  });

  const loadOpportunity = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    setNotFound(false);

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/opportunities/${opportunityId}`,
      );

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to load opportunity.");
      }

      const body = (await response.json()) as { data: { opportunity: OpportunityDetail } };
      setOpportunity(body.data.opportunity);
      setForm({
        value: body.data.opportunity.value?.toString() ?? "",
        currency: body.data.opportunity.currency,
        expectedCloseDate: body.data.opportunity.expectedCloseDate
          ? body.data.opportunity.expectedCloseDate.slice(0, 10)
          : "",
        notes: body.data.opportunity.notes ?? "",
        assignedTo: body.data.opportunity.assignedUser?.id ?? "",
        tagIds: body.data.opportunity.tagsResolved.map((tag) => tag.id),
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load opportunity.",
      );
    } finally {
      setLoading(false);
    }
  }, [opportunityId, workspaceSlug]);

  useEffect(() => {
    void loadOpportunity();
  }, [loadOpportunity]);

  useEffect(() => {
    void (async () => {
      const [stagesResponse, lostReasonsResponse, tagsResponse, membersResponse] =
        await Promise.all([
          fetch(`/api/workspaces/${workspaceSlug}/dictionary-items?type=opportunity_status`),
          fetch(`/api/workspaces/${workspaceSlug}/dictionary-items?type=lost_reason`),
          fetch(`/api/workspaces/${workspaceSlug}/tags?entityType=opportunity`),
          fetch(`/api/workspaces/${workspaceSlug}/members`),
        ]);

      if (stagesResponse.ok) {
        const payload = (await stagesResponse.json()) as { data: { items: DictionaryItem[] } };
        setStages(payload.data.items);
      }
      if (lostReasonsResponse.ok) {
        const payload = (await lostReasonsResponse.json()) as {
          data: { items: Array<{ id: string; label: string }> };
        };
        setLostReasons(payload.data.items);
      }
      if (tagsResponse.ok) {
        const payload = (await tagsResponse.json()) as { data: { tags: TagSelectorTag[] } };
        setTags(payload.data.tags);
      }
      if (membersResponse.ok) {
        const payload = (await membersResponse.json()) as { data: { members: MemberSelectorMember[] } };
        setMembers(payload.data.members);
      }
    })();
  }, [workspaceSlug]);

  const moveStage = async (
    statusId: string,
    lostReasonId?: string,
    lostReasonText?: string,
  ) => {
    setStagePending(true);
    setError(null);

    try {
      const payload: Record<string, string> = { statusId };
      if (lostReasonId) payload.lostReasonId = lostReasonId;
      if (lostReasonText) payload.lostReasonText = lostReasonText;

      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/opportunities/${opportunityId}/stage`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to update stage.");
      }

      await loadOpportunity();
    } catch (stageError) {
      setError(stageError instanceof Error ? stageError.message : "Failed to update stage.");
    } finally {
      setStagePending(false);
      setLostModal(null);
    }
  };

  const handleStageChange = (statusId: string) => {
    if (!opportunity || statusId === opportunity.statusId) return;

    const nextStatus = stages.find((stage) => stage.id === statusId);
    if (!nextStatus) return;

    if (isTerminalWonBehavior(nextStatus.behavior)) {
      if (!window.confirm("Mark this opportunity as won?")) return;
      void moveStage(statusId);
      return;
    }

    if (isTerminalLostBehavior(nextStatus.behavior)) {
      setLostModal(statusId);
      return;
    }

    void moveStage(statusId);
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/opportunities/${opportunityId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            value: form.value ? Number(form.value) : null,
            currency: form.currency,
            expectedCloseDate: form.expectedCloseDate || null,
            notes: form.notes || null,
            assignedTo: form.assignedTo || null,
            tags: form.tagIds,
          }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to update opportunity.");
      }

      setDrawerOpen(false);
      await loadOpportunity();
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Failed to update opportunity.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!window.confirm("Archive this opportunity?")) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/opportunities/${opportunityId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to archive opportunity.");
      }

      window.location.href = workspacePath(workspaceSlug, "pipeline");
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Failed to archive opportunity.",
      );
      setSubmitting(false);
    }
  };

  if (forbidden) {
    return (
      <PermissionDenied
        title="Permission denied"
        description="You do not have permission to view this opportunity."
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full max-w-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <StateView
        variant="empty"
        title="Opportunity not found"
        description="This opportunity does not exist in the current workspace."
        primaryAction={{
          label: "Back to pipeline",
          onClick: () => {
            window.location.href = workspacePath(workspaceSlug, "pipeline");
          },
        }}
      />
    );
  }

  if (error && !opportunity) {
    return (
      <ErrorState
        title="Could not load opportunity"
        description={error}
        primaryAction={{ label: "Retry", onClick: () => void loadOpportunity() }}
      />
    );
  }

  if (!opportunity) {
    return null;
  }

  const isTerminal = isTerminalOpportunityBehavior(opportunity.status?.behavior);
  const currentStageIndex = stages.findIndex((stage) => stage.id === opportunity.statusId);

  return (
    <>
      <PageHeader
        back={{
          href: workspacePath(workspaceSlug, "pipeline"),
          label: "Back to pipeline",
        }}
        title={
          <span className="flex items-center gap-2 flex-wrap">
            {opportunity.lead?.fullName ?? "Lead"} — {opportunity.property?.title ?? "Property"}
            {opportunity.status && (
              <StatusBadge
                label={opportunity.status.label}
                color={opportunity.status.color}
                behavior={opportunity.status.behavior}
              />
            )}
          </span>
        }
        description={`Expected close ${formatDate(opportunity.expectedCloseDate)}`}
        meta={
          <span className="text-[18px] font-bold tabular text-[var(--color-brand-700)] ml-3">
            {formatPrice(opportunity.value, opportunity.currency)}
          </span>
        }
        actions={
          <>
            {canUpdate && (
              <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
                Edit
              </Button>
            )}
            {canArchive && (
              <Button variant="secondary" onClick={() => void handleArchive()} disabled={submitting}>
                Archive
              </Button>
            )}
            {canUpdate && !isTerminal && (
              <Button
                leadingIcon={<IconCheck size={14} />}
                onClick={() => {
                  const wonStage = stages.find((stage) =>
                    isTerminalWonBehavior(stage.behavior),
                  );
                  if (wonStage) handleStageChange(wonStage.id);
                }}
                disabled={stagePending}
              >
                Mark as won
              </Button>
            )}
          </>
        }
      />

      {error && (
        <p className="mb-3 text-[12.5px] text-[var(--color-danger-fg)]">{error}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card>
          <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-2">
            Lead
          </p>
          {opportunity.lead ? (
            <Link
              href={workspacePath(workspaceSlug, "leads", opportunity.lead.id)}
              className="flex items-center gap-3 hover:opacity-90"
            >
              <Avatar
                user={{
                  id: opportunity.lead.id,
                  name: opportunity.lead.fullName,
                  initials: userInitials(opportunity.lead.fullName, opportunity.lead.email ?? ""),
                }}
                size={36}
              />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[var(--color-ink)] truncate">
                  {opportunity.lead.fullName}
                </p>
                <p className="text-[12px] text-[var(--color-ink-muted)] truncate">
                  {opportunity.lead.email ?? opportunity.lead.phone ?? "—"}
                </p>
              </div>
            </Link>
          ) : (
            <p className="text-[13px] text-[var(--color-ink-muted)]">—</p>
          )}
        </Card>

        <Card>
          <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-2">
            Property
          </p>
          {opportunity.property ? (
            <Link
              href={workspacePath(workspaceSlug, "properties", opportunity.property.id)}
              className="block hover:opacity-90"
            >
              <p className="text-[14px] font-semibold text-[var(--color-ink)] truncate">
                {opportunity.property.title}
              </p>
              <p className="text-[12px] text-[var(--color-ink-muted)] tabular truncate">
                {opportunity.property.reference ?? "No reference"} ·{" "}
                {formatPrice(opportunity.property.price, opportunity.property.currency)}
              </p>
            </Link>
          ) : (
            <p className="text-[13px] text-[var(--color-ink-muted)]">—</p>
          )}
        </Card>

        <Card>
          <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-2">
            Assigned
          </p>
          {opportunity.assignedUser ? (
            <AvatarWithName
              user={{
                id: opportunity.assignedUser.id,
                name: opportunity.assignedUser.name ?? opportunity.assignedUser.email,
                initials: userInitials(
                  opportunity.assignedUser.name,
                  opportunity.assignedUser.email,
                ),
              }}
              size={30}
            />
          ) : (
            <p className="text-[13px] text-[var(--color-ink-muted)]">Unassigned</p>
          )}
          <div className="mt-3 text-[12.5px] text-[var(--color-ink-soft)] tabular">
            {opportunity.probability !== null
              ? `${opportunity.probability}% probability`
              : "—"}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-1 self-start">
          <CardHeader title="Pipeline stage" subtitle="Current progression" />
          {canUpdate && (
            <div className="px-4 pb-3">
              <Label htmlFor="stage-select">Move stage</Label>
              <Select
                id="stage-select"
                value={opportunity.statusId}
                onChange={(event) => handleStageChange(event.target.value)}
                disabled={stagePending}
              >
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <ol className="relative pl-5 px-4 pb-4">
            <span className="absolute left-[22px] top-2 bottom-4 w-px bg-[var(--color-line)]" />
            {stages.map((stage, index) => {
              const isCurrent = index === currentStageIndex;
              const isPast = currentStageIndex >= 0 && index < currentStageIndex;
              return (
                <li
                  key={stage.id}
                  className={`relative mb-3 last:mb-0 ${
                    isCurrent
                      ? "px-3 py-2 -mx-1 rounded-lg bg-[var(--color-brand-50)] border border-[var(--color-brand-100)]"
                      : ""
                  }`}
                >
                  <span
                    className={`absolute ${
                      isCurrent ? "-left-[12px] top-3" : "-left-[15px] top-1"
                    } w-3 h-3 rounded-full border-2 border-white`}
                    style={{
                      background: isPast
                        ? "var(--color-success-fg)"
                        : isCurrent
                          ? stage.color
                          : "var(--color-line-strong)",
                    }}
                  />
                  <p
                    className={`text-[13.5px] ${
                      isCurrent
                        ? "font-semibold text-[var(--color-brand-800)]"
                        : isPast
                          ? "text-[var(--color-ink-soft)]"
                          : "text-[var(--color-ink-muted)]"
                    }`}
                  >
                    {stage.label}
                  </p>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card padded={false} className="xl:col-span-2">
          <Tabs
            className="px-5"
            items={[
              {
                key: "overview",
                label: "Overview",
                content: (
                  <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Info label="Value" value={formatPrice(opportunity.value, opportunity.currency)} />
                    <Info
                      label="Probability"
                      value={
                        opportunity.probability !== null
                          ? `${opportunity.probability}%`
                          : "—"
                      }
                    />
                    <Info
                      label="Expected close"
                      value={formatDate(opportunity.expectedCloseDate)}
                    />
                    <Info label="Created" value={formatDate(opportunity.createdAt)} />
                    <Info label="Closed" value={formatDate(opportunity.closedAt)} />
                    <Info label="Won" value={formatDate(opportunity.wonAt)} />
                    <Info label="Lost" value={formatDate(opportunity.lostAt)} />
                    <Info label="Lost reason" value={opportunity.lostReason?.label ?? "—"} />
                    <Info
                      label="Lost reason details"
                      value={opportunity.lostReasonText ?? "—"}
                    />
                    <Info label="Notes" value={opportunity.notes ?? "—"} />
                    <Info
                      label="Tags"
                      value={
                        opportunity.tagsResolved.length > 0
                          ? opportunity.tagsResolved.map((tag) => tag.name).join(", ")
                          : "—"
                      }
                    />
                  </div>
                ),
              },
              {
                key: "activities",
                label: "Activities",
                content: (
                  <ActivitiesSection
                    workspaceSlug={workspaceSlug}
                    opportunityId={opportunityId}
                    canRead={canReadActivities}
                    canCreate={canCreateActivity}
                    canUpdate={canUpdateActivity}
                    canArchive={canArchiveActivity}
                    compact
                  />
                ),
              },
              {
                key: "notes",
                label: "Notes",
                content: (
                  <div className="px-5 pb-5">
                    <StateView
                      variant="empty"
                      compact
                      title="Timeline notes coming soon"
                      description="Use the internal notes field on the opportunity record for now."
                    />
                  </div>
                ),
              },
              {
                key: "files",
                label: "Files",
                content: (
                  <div className="px-5 pb-5">
                    <StateView
                      variant="empty"
                      compact
                      title="No files yet"
                      description="Documents attached to this opportunity will appear here in a later phase."
                    />
                  </div>
                ),
              },
              {
                key: "documents",
                label: "Documents",
                content: (
                  <div className="px-5 pb-5">
                    <StateView
                      variant="empty"
                      compact
                      title="No documents generated yet"
                      description="Contracts and offers will appear here once generated from the workspace."
                    />
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Edit opportunity"
        className="w-[min(100%,480px)]"
      >
        <form className="space-y-4" onSubmit={(event) => void handleUpdate(event)}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-value">Value</Label>
              <Input
                id="edit-value"
                type="number"
                min={0}
                value={form.value}
                onChange={(event) =>
                  setForm((current) => ({ ...current, value: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="edit-currency">Currency</Label>
              <Input
                id="edit-currency"
                value={form.currency}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    currency: event.target.value.toUpperCase(),
                  }))
                }
                maxLength={3}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="edit-expected-close">Expected close date</Label>
            <Input
              id="edit-expected-close"
              type="date"
              value={form.expectedCloseDate}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  expectedCloseDate: event.target.value,
                }))
              }
            />
          </div>

          <div>
            <Label>Assigned to</Label>
            <MemberSelector
              members={members}
              selectedUserId={form.assignedTo || null}
              onChange={(userId) =>
                setForm((current) => ({
                  ...current,
                  assignedTo: userId ?? "",
                }))
              }
              placeholder="Unassigned"
            />
          </div>

          <div>
            <Label>Tags</Label>
            <TagSelector
              tags={tags}
              entityType="opportunity"
              selectedTagIds={form.tagIds}
              onToggle={(tagId) =>
                setForm((current) => ({
                  ...current,
                  tagIds: current.tagIds.includes(tagId)
                    ? current.tagIds.filter((id) => id !== tagId)
                    : [...current.tagIds, tagId],
                }))
              }
            />
          </div>

          <div>
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDrawerOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Drawer>

      <LostReasonModal
        open={lostModal !== null}
        onClose={() => setLostModal(null)}
        lostReasons={lostReasons}
        pending={stagePending}
        onConfirm={(lostReasonId, lostReasonText) => {
          if (!lostModal) return;
          void moveStage(lostModal, lostReasonId, lostReasonText);
        }}
      />
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-1">
        {label}
      </p>
      <p className="text-[13.5px] text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
