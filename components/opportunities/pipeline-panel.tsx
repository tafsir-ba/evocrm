"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { KanbanCard } from "@/components/domain/kanban-card";
import { KanbanColumn } from "@/components/domain/kanban-column";
import { SearchInput } from "@/components/domain/search-input";
import { LostReasonModal } from "@/components/opportunities/lost-reason-modal";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isTerminalLostBehavior,
  isTerminalWonBehavior,
} from "@/lib/dictionary-form-helpers";
import { formatPrice } from "@/lib/format-price";
import { IconPlus } from "@/lib/icons";
import { appendProjectIdToSearchParams } from "@/lib/project-scope";
import { useWorkspaceProjectFilter } from "@/lib/use-workspace-project-filter";
import { workspacePath } from "@/lib/workspace-paths";

type PipelineColumnData = {
  status: {
    id: string;
    label: string;
    key: string;
    color: string;
    behavior?: string;
    defaultProbability?: number;
    order: number;
  };
  count: number;
  valueTotal: number;
  opportunities: Array<{
    id: string;
    value: number | null;
    currency: string;
    probability: number | null;
    statusId: string;
    lead: { id: string; fullName: string } | null;
    property: { id: string; title: string; reference: string | null } | null;
    assignedUser: { id: string; name: string | null; email: string } | null;
  }>;
};

type PipelineResponse = {
  columns: PipelineColumnData[];
  totals: { count: number; activeValue: number };
};

type MemberOption = {
  userId: string;
  name: string | null;
  email: string;
};

function memberInitials(member: {
  userId?: string;
  name: string | null;
  email: string | null | undefined;
}): string {
  if (member.name) {
    return member.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  if (member.email) {
    return member.email.slice(0, 2).toUpperCase();
  }

  return "?";
}

type PipelinePanelProps = {
  workspaceSlug: string;
  defaultCurrency: string;
  canCreate: boolean;
  canUpdate: boolean;
};

export function PipelinePanel({
  workspaceSlug,
  defaultCurrency,
  canCreate,
  canUpdate,
}: PipelinePanelProps) {
  const router = useRouter();
  const projectId = useWorkspaceProjectFilter();
  const [pipeline, setPipeline] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [lostReasons, setLostReasons] = useState<Array<{ id: string; label: string }>>(
    [],
  );
  const [stageMovePending, setStageMovePending] = useState<string | null>(null);
  const [stageMoveError, setStageMoveError] = useState<string | null>(null);
  const [lostModal, setLostModal] = useState<{
    opportunityId: string;
    statusId: string;
  } | null>(null);

  const loadPipeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (assignedFilter) params.set("assignedTo", assignedFilter);
      appendProjectIdToSearchParams(params, projectId);

      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/pipeline?${params.toString()}`,
      );

      if (response.status === 403) {
        setForbidden(true);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to load pipeline.");
      }

      const body = (await response.json()) as { data?: PipelineResponse | null };
      const nextPipeline = body.data;
      if (
        !nextPipeline ||
        !Array.isArray(nextPipeline.columns) ||
        !nextPipeline.totals ||
        typeof nextPipeline.totals.count !== "number"
      ) {
        throw new Error("Pipeline response was incomplete.");
      }
      setPipeline({
        columns: nextPipeline.columns,
        totals: nextPipeline.totals,
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load pipeline.",
      );
    } finally {
      setLoading(false);
    }
  }, [assignedFilter, projectId, search, workspaceSlug]);

  useEffect(() => {
    void loadPipeline();
  }, [loadPipeline]);

  useEffect(() => {
    void (async () => {
      const [membersResponse, lostReasonsResponse] = await Promise.all([
        fetch(`/api/workspaces/${workspaceSlug}/members`),
        fetch(`/api/workspaces/${workspaceSlug}/dictionary-items?type=lost_reason`),
      ]);

      if (membersResponse.ok) {
        const payload = (await membersResponse.json()) as {
          data?: { members?: MemberOption[] };
        };
        setMembers(Array.isArray(payload.data?.members) ? payload.data.members : []);
      }
      if (lostReasonsResponse.ok) {
        const payload = (await lostReasonsResponse.json()) as {
          data?: { items?: Array<{ id: string; label: string }> };
        };
        setLostReasons(Array.isArray(payload.data?.items) ? payload.data.items : []);
      }
    })();
  }, [workspaceSlug]);

  const allStages = useMemo(
    () => pipeline?.columns?.map((column) => column.status) ?? [],
    [pipeline],
  );

  const moveStage = async (
    opportunityId: string,
    statusId: string,
    lostReasonId?: string,
    lostReasonText?: string,
  ) => {
    setStageMovePending(opportunityId);
    setStageMoveError(null);

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
        throw new Error(body.error?.message ?? "Failed to move opportunity.");
      }

      await loadPipeline();
    } catch (moveError) {
      setStageMoveError(
        moveError instanceof Error ? moveError.message : "Failed to move opportunity.",
      );
    } finally {
      setStageMovePending(null);
      setLostModal(null);
    }
  };

  const handleStageSelect = (
    opportunityId: string,
    currentStatusId: string,
    nextStatusId: string,
  ) => {
    if (!canUpdate || !nextStatusId || nextStatusId === currentStatusId) {
      return;
    }

    const nextStatus = allStages.find((stage) => stage.id === nextStatusId);
    if (!nextStatus) {
      return;
    }

    if (isTerminalWonBehavior(nextStatus.behavior)) {
      const confirmed = window.confirm("Mark this opportunity as won?");
      if (!confirmed) return;
      void moveStage(opportunityId, nextStatusId);
      return;
    }

    if (isTerminalLostBehavior(nextStatus.behavior)) {
      setLostModal({ opportunityId, statusId: nextStatusId });
      return;
    }

    void moveStage(opportunityId, nextStatusId);
  };

  if (forbidden) {
    return <PermissionDenied title="Permission denied" description="You do not have permission to view the pipeline." />;
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full max-w-xl" />
        <div className="grid grid-flow-col auto-cols-[240px] gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[220px] w-[240px]" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load pipeline"
        description={error}
        primaryAction={{ label: "Retry", onClick: () => void loadPipeline() }}
      />
    );
  }

  if (!pipeline) {
    return (
      <ErrorState
        title="Could not load pipeline"
        description="Pipeline data is unavailable. Retry to reload opportunities by stage."
        primaryAction={{ label: "Retry", onClick: () => void loadPipeline() }}
      />
    );
  }

  const activeValueLabel =
    pipeline.totals.activeValue > 0
      ? formatPrice(pipeline.totals.activeValue, defaultCurrency)
      : "—";
  const columns = pipeline.columns ?? [];

  return (
    <>
      <PageHeader
        density="compact"
        title="Pipeline"
        meta={
          <span className="text-[12.5px] text-[var(--color-ink-muted)] tabular">
            {pipeline.totals.count} open · {activeValueLabel}
          </span>
        }
        actions={
          canCreate ? (
            <Button
              leadingIcon={<IconPlus size={14} />}
              onClick={() => router.push(workspacePath(workspaceSlug, "opportunities", "new"))}
            >
              New opportunity
            </Button>
          ) : undefined
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <div className="min-w-[200px] max-w-md flex-1">
          <SearchInput
            placeholder="Search opportunities…"
            aria-label="Search opportunities"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          fieldSize="sm"
          className="w-auto min-w-[160px]"
          value={assignedFilter}
          onChange={(event) => setAssignedFilter(event.target.value)}
        >
          <option value="">All assignees</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name ?? member.email}
            </option>
          ))}
        </Select>
      </div>

      {stageMoveError && (
        <p className="mb-3 text-[12.5px] text-[var(--color-danger-fg)]">{stageMoveError}</p>
      )}

      {columns.length === 0 ? (
        <EmptyState
          title="No opportunities in pipeline"
          description="Create an opportunity to connect a lead with a property."
          primaryAction={
            canCreate
              ? {
                  label: "New opportunity",
                  onClick: () => router.push(workspacePath(workspaceSlug, "opportunities", "new")),
                }
              : undefined
          }
        />
      ) : (
        <div className="-mx-4 md:-mx-6 lg:-mx-8 min-w-0 max-w-full overflow-x-auto px-4 pb-4 md:px-6 lg:px-8">
          <div className="grid w-max grid-flow-col auto-cols-[minmax(220px,250px)] gap-2">
            {columns.map((column) => (
              <KanbanColumn
                key={column.status.id}
                title={column.status.label}
                count={column.count}
                accentColor={column.status.color}
                summary={
                  <>
                    Total{" "}
                    <span className="text-[var(--color-ink-soft)] font-semibold">
                      {column.valueTotal > 0
                        ? formatPrice(column.valueTotal, defaultCurrency)
                        : "—"}
                    </span>
                  </>
                }
                emptyLabel="No opportunities"
                cards={(column.opportunities ?? []).map((opportunity) => ({
                  id: opportunity.id,
                  title: opportunity.lead?.fullName ?? "Lead",
                  subtitle:
                    opportunity.property?.reference ??
                    opportunity.property?.title ??
                    "Property",
                  metaLeft: formatPrice(opportunity.value, opportunity.currency),
                  metaRight:
                    opportunity.probability !== null
                      ? `${opportunity.probability}%`
                      : undefined,
                  href: workspacePath(workspaceSlug, "opportunities", opportunity.id),
                }))}
                renderCard={(card) => {
                  const opportunity = (column.opportunities ?? []).find(
                    (item) => item.id === card.id,
                  );
                  return (
                    <KanbanCard
                      title={card.title}
                      subtitle={card.subtitle}
                      metaLeft={card.metaLeft}
                      metaRight={card.metaRight}
                      href={card.href}
                      avatar={
                        opportunity?.assignedUser ? (
                          <Avatar
                            user={{
                              id: opportunity.assignedUser.id,
                              name:
                                opportunity.assignedUser.name ??
                                opportunity.assignedUser.email ??
                                "User",
                              initials: memberInitials({
                                userId: opportunity.assignedUser.id,
                                name: opportunity.assignedUser.name,
                                email: opportunity.assignedUser.email,
                              }),
                            }}
                            size={18}
                          />
                        ) : undefined
                      }
                      footer={
                        canUpdate && opportunity ? (
                          <Select
                            fieldSize="sm"
                            aria-label={`Move ${card.title}`}
                            value={opportunity.statusId}
                            onChange={(event) =>
                              handleStageSelect(
                                opportunity.id,
                                opportunity.statusId,
                                event.target.value,
                              )
                            }
                            disabled={stageMovePending === opportunity.id}
                            className="h-7 text-[12px]"
                          >
                            {allStages.map((stage) => (
                              <option key={stage.id} value={stage.id}>
                                {stage.id === opportunity.statusId
                                  ? stage.label
                                  : `Move to ${stage.label}`}
                              </option>
                            ))}
                          </Select>
                        ) : undefined
                      }
                    />
                  );
                }}
              />
            ))}
          </div>
        </div>
      )}

      <LostReasonModal
        open={lostModal !== null}
        onClose={() => setLostModal(null)}
        lostReasons={lostReasons}
        pending={stageMovePending !== null}
        error={stageMoveError}
        onConfirm={(lostReasonId, lostReasonText) => {
          if (!lostModal) return;
          void moveStage(
            lostModal.opportunityId,
            lostModal.statusId,
            lostReasonId,
            lostReasonText,
          );
        }}
      />
    </>
  );
}
