"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { compactProjectMembershipLabel } from "@/lib/lead-project-membership";

export type LeadProjectMembershipItem = {
  id: string;
  projectId: string;
  isPrimary: boolean;
  sourceOrder: number;
  project: { id: string; name: string; reference: string | null } | null;
};

export type LeadProjectOption = {
  id: string;
  name: string;
  reference?: string | null;
};

type LeadProjectMembershipsProps = {
  memberships: LeadProjectMembershipItem[];
  projects?: LeadProjectOption[];
  canUpdate?: boolean;
  compact?: boolean;
  disabled?: boolean;
  onAdd?: (projectId: string, isPrimary?: boolean) => Promise<void> | void;
  onRemove?: (membershipId: string) => Promise<void> | void;
  onSetPrimary?: (membershipId: string) => Promise<void> | void;
  onReorder?: (membershipIds: string[]) => Promise<void> | void;
};

function projectLabel(project: { name: string; reference?: string | null } | null): string {
  if (!project) {
    return "Unknown project";
  }
  return project.reference ? `${project.name} (${project.reference})` : project.name;
}

export function LeadProjectMemberships({
  memberships,
  projects = [],
  canUpdate = false,
  compact = false,
  disabled = false,
  onAdd,
  onRemove,
  onSetPrimary,
  onReorder,
}: LeadProjectMembershipsProps) {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [pending, setPending] = useState(false);

  const ordered = useMemo(
    () =>
      [...memberships].sort((left, right) => {
        if (left.isPrimary !== right.isPrimary) {
          return left.isPrimary ? -1 : 1;
        }
        return left.sourceOrder - right.sourceOrder;
      }),
    [memberships],
  );
  const primary = ordered.find((item) => item.isPrimary) ?? ordered[0] ?? null;
  const secondary = ordered.filter((item) => item.id !== primary?.id);
  const memberProjectIds = new Set(ordered.map((item) => item.projectId));
  const availableProjects = projects.filter((project) => !memberProjectIds.has(project.id));

  async function run(action: () => Promise<void> | void) {
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  if (compact) {
    return (
      <span
        className="truncate"
        title={compactProjectMembershipLabel({
          primaryName: primary?.project?.name,
          secondaryCount: secondary.length,
        })}
      >
        {primary?.project?.name ?? "—"}
        {secondary.length > 0 ? (
          <Badge tone="muted" size="sm" className="ml-1">
            +{secondary.length}
          </Badge>
        ) : null}
      </span>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {primary ? (
          <Badge tone="info" size="sm">
            Primary · {projectLabel(primary.project)}
          </Badge>
        ) : (
          <span className="text-[13px] text-[var(--color-ink-muted)]">No project</span>
        )}
        {secondary.map((item) => (
          <Badge key={item.id} tone="muted" size="sm">
            {projectLabel(item.project)}
          </Badge>
        ))}
      </div>

      {canUpdate && !disabled ? (
        <div className="space-y-2">
          {availableProjects.length > 0 && onAdd ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Add project membership"
                className="h-8 min-w-[12rem] rounded border border-[var(--color-line)] bg-white px-2 text-[12.5px]"
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                disabled={pending}
              >
                <option value="">Add a project…</option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {projectLabel(project)}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                disabled={!selectedProjectId || pending}
                onClick={() =>
                  void run(async () => {
                    await onAdd(selectedProjectId, false);
                    setSelectedProjectId("");
                  })
                }
              >
                Add
              </Button>
            </div>
          ) : null}

          {ordered.length > 0 ? (
            <ul className="space-y-1.5">
              {ordered.map((item, index) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--color-line)] px-2.5 py-1.5 text-[12.5px]"
                >
                  <span className="min-w-0 truncate">
                    {projectLabel(item.project)}
                    {item.isPrimary ? " · Primary" : ""}
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    {onReorder && ordered.length > 1 ? (
                      <>
                        <Button
                          variant="ghost"
                          disabled={pending || index === 0}
                          onClick={() => {
                            const next = ordered.map((membership) => membership.id);
                            const swap = next[index - 1];
                            if (!swap) {
                              return;
                            }
                            next[index - 1] = item.id;
                            next[index] = swap;
                            void run(() => onReorder(next));
                          }}
                        >
                          Up
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={pending || index === ordered.length - 1}
                          onClick={() => {
                            const next = ordered.map((membership) => membership.id);
                            const swap = next[index + 1];
                            if (!swap) {
                              return;
                            }
                            next[index + 1] = item.id;
                            next[index] = swap;
                            void run(() => onReorder(next));
                          }}
                        >
                          Down
                        </Button>
                      </>
                    ) : null}
                    {!item.isPrimary && onSetPrimary ? (
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Make ${projectLabel(item.project)} the primary project?`,
                            )
                          ) {
                            return;
                          }
                          void run(() => onSetPrimary(item.id));
                        }}
                      >
                        Set primary
                      </Button>
                    ) : null}
                    {!item.isPrimary && onRemove ? (
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Remove ${projectLabel(item.project)} from this contact?`,
                            )
                          ) {
                            return;
                          }
                          void run(() => onRemove(item.id));
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
