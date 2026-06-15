"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { StatusBadge } from "@/components/domain/status-badge";
import { LostReasonModal } from "@/components/opportunities/lost-reason-modal";
import { ActivitiesSection } from "@/components/activities/activities-section";
import { DocumentsSection } from "@/components/documents/documents-section";
import { PageHeader } from "@/components/layout/page-header";
import { StateView } from "@/components/states/state-view";
import { Avatar, AvatarWithName } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Select, Label } from "@/components/ui/input";
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
  workspaceTimezone: string;
  canUpdate: boolean;
  canArchive: boolean;
  canReadActivities: boolean;
  canCreateActivity: boolean;
  canUpdateActivity: boolean;
  canArchiveActivity: boolean;
  canReadDocuments: boolean;
  canCreateDocument: boolean;
  canArchiveDocument: boolean;
};

export function OpportunityDetailPanel({
  workspaceSlug,
  opportunityId,
  workspaceTimezone,
  canUpdate,
  canArchive,
  canReadActivities,
  canCreateActivity,
  canUpdateActivity,
  canArchiveActivity,
  canReadDocuments,
  canCreateDocument,
  canArchiveDocument,
}: OpportunityDetailPanelProps) {
  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [stages, setStages] = useState<DictionaryItem[]>([]);
  const [lostReasons, setLostReasons] = useState<Array<{ id: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [stagePending, setStagePending] = useState(false);
  const [archivePending, setArchivePending] = useState(false);
  const [lostModal, setLostModal] = useState<string | null>(null);

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
      const [stagesResponse, lostReasonsResponse] = await Promise.all([
        fetch(`/api/workspaces/${workspaceSlug}/dictionary-items?type=opportunity_status`),
        fetch(`/api/workspaces/${workspaceSlug}/dictionary-items?type=lost_reason`),
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

  const handleArchive = async () => {
    if (!window.confirm("Archive this opportunity?")) return;

    setArchivePending(true);
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
      setArchivePending(false);
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
              <Link href={workspacePath(workspaceSlug, "opportunities", opportunityId, "edit")}>
                <Button variant="secondary">Edit</Button>
              </Link>
            )}
            {canArchive && (
              <Button variant="secondary" onClick={() => void handleArchive()} disabled={archivePending}>
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
                    workspaceTimezone={workspaceTimezone}
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
                  <DocumentsSection
                    workspaceSlug={workspaceSlug}
                    linkedEntityType="opportunity"
                    linkedEntityId={opportunityId}
                    canRead={canReadDocuments}
                    canCreate={canCreateDocument}
                    canArchive={canArchiveDocument}
                  />
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
