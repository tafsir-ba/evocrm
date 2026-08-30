"use client";

import Link from "next/link";
import type { ChangeEvent, ReactNode } from "react";

import { StatusBadge } from "@/components/domain/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isValidHexColor } from "@/lib/dictionary-colors";
import { IconChevronRight, IconMail, IconPhone } from "@/lib/icons";
import {
  formatActivityLine,
  formatOwnerName,
  formatRelativeAge,
  formatSourceContext,
  formatUtmTitle,
  telHref,
  visibleLeadTags,
} from "@/lib/leads-table";
import { cn } from "@/lib/utils";
import { workspacePath } from "@/lib/workspace-paths";

export type LeadTableDictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
};

export type LeadTableMember = {
  userId: string;
  name: string | null;
  email: string;
};

export type LeadTableItem = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  archivedAt?: string | null;
  attributes?: Record<string, unknown> | null;
  lastContactedAt?: string | Date | null;
  status: LeadTableDictionaryItem | null;
  statusId?: string;
  source: LeadTableDictionaryItem | null;
  project: { id: string; name: string; reference: string | null } | null;
  tagsResolved: Array<{ id: string; name: string; color: string }>;
  assignedUser: { id: string; name: string | null; email: string } | null;
  lastActivity?: { id: string; title: string; at: string | Date } | null;
  nextAction?: { id: string; title: string; at: string | Date } | null;
};

type LeadsTableProps = {
  workspaceSlug: string;
  leads: LeadTableItem[];
  statuses: LeadTableDictionaryItem[];
  members: LeadTableMember[];
  canUpdate: boolean;
  canArchive: boolean;
  canDelete: boolean;
  selectedLeadIds: Set<string>;
  selectAllMatching: boolean;
  excludedLeadIds: Set<string>;
  allPageSelected: boolean;
  somePageSelected: boolean;
  pendingLeadId: string | null;
  onToggleLead: (leadId: string) => void;
  onTogglePage: () => void;
  onAssign: (leadId: string, assignedTo: string | null) => void;
  onStatusChange: (leadId: string, statusId: string) => void;
  onArchive: (leadId: string, leadName: string) => void;
  onRestore: (leadId: string, leadName: string) => void;
};

const compactSelectClass =
  "h-7 max-w-[9.5rem] min-w-[6.75rem] appearance-none truncate rounded border border-[var(--color-line)] bg-white bg-[length:12px_12px] bg-[right_0.4rem_center] bg-no-repeat px-2 pr-6 text-[12px] text-[var(--color-ink)] focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-100)] disabled:opacity-60";

function RowSelect({
  value,
  disabled,
  label,
  onChange,
  children,
  className,
}: {
  value: string;
  disabled?: boolean;
  label: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onChange={onChange}
      className={cn(compactSelectClass, className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")",
      }}
    >
      {children}
    </select>
  );
}

function TagChip({ tag }: { tag: { id: string; name: string; color: string } }) {
  const color = isValidHexColor(tag.color) ? tag.color : null;

  return (
    <span
      title={tag.name}
      className="inline-flex max-w-[7.5rem] truncate rounded border px-1.5 py-px text-[10.5px] font-medium leading-4"
      style={
        color
          ? {
              color,
              borderColor: `${color}55`,
              backgroundColor: `${color}18`,
            }
          : undefined
      }
    >
      {tag.name}
    </span>
  );
}

function ContactChannels({ lead }: { lead: LeadTableItem }) {
  if (!lead.email && !lead.phone) {
    return <span className="text-[var(--color-ink-faint)]">No contact</span>;
  }

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      {lead.email ? (
        <a
          href={`mailto:${lead.email}`}
          className="inline-flex min-w-0 max-w-[14rem] items-center gap-1 text-[var(--color-ink-muted)] hover:text-[var(--color-brand-700)]"
          title={lead.email}
          onClick={(event) => event.stopPropagation()}
        >
          <IconMail size={12} className="shrink-0" />
          <span className="truncate">{lead.email}</span>
        </a>
      ) : null}
      {lead.phone ? (
        <a
          href={telHref(lead.phone)}
          className="inline-flex items-center gap-1 whitespace-nowrap text-[var(--color-ink-muted)] hover:text-[var(--color-brand-700)]"
          title={lead.phone}
          onClick={(event) => event.stopPropagation()}
        >
          <IconPhone size={12} className="shrink-0" />
          <span>{lead.phone}</span>
        </a>
      ) : null}
    </span>
  );
}

function LeadTags({ tags }: { tags: LeadTableItem["tagsResolved"] }) {
  if (tags.length === 0) {
    return <span className="text-[var(--color-ink-faint)]">—</span>;
  }

  const { visible, overflow } = visibleLeadTags(tags, 2);

  return (
    <div className="flex min-w-0 items-center gap-1">
      {visible.map((tag) => (
        <TagChip key={tag.id} tag={tag} />
      ))}
      {overflow > 0 ? (
        <span
          className="text-[10.5px] font-medium text-[var(--color-ink-muted)]"
          title={tags
            .slice(2)
            .map((tag) => tag.name)
            .join(", ")}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function ActivityCell({ lead }: { lead: LeadTableItem }) {
  const lines = formatActivityLine({
    lastActivity: lead.lastActivity,
    nextAction: lead.nextAction,
    lastContactedAt: lead.lastContactedAt,
  });

  if (!lines.last && !lines.next) {
    return <span className="text-[var(--color-ink-faint)]">—</span>;
  }

  return (
    <div className="min-w-0 leading-snug">
      {lines.last ? (
        <p className="truncate text-[var(--color-ink-soft)]" title={lines.last}>
          {lines.last}
        </p>
      ) : null}
      {lines.next ? (
        <p className="truncate text-[var(--color-ink-muted)]" title={lines.next}>
          Next {lines.next}
        </p>
      ) : null}
    </div>
  );
}

function SourceCell({ lead }: { lead: LeadTableItem }) {
  const { source, context } = formatSourceContext(lead.source?.label, lead.attributes);
  const utmTitle = formatUtmTitle(lead.attributes);

  return (
    <div className="min-w-0 leading-snug">
      <p className="truncate text-[var(--color-ink-soft)]">{source}</p>
      {context ? (
        <p className="truncate text-[11px] text-[var(--color-ink-muted)]" title={utmTitle}>
          {context}
        </p>
      ) : null}
    </div>
  );
}

function StatusCell({
  lead,
  statuses,
  canUpdate,
  pending,
  onStatusChange,
}: {
  lead: LeadTableItem;
  statuses: LeadTableDictionaryItem[];
  canUpdate: boolean;
  pending: boolean;
  onStatusChange: (statusId: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {lead.status ? (
        <StatusBadge label={lead.status.label} color={lead.status.color} size="sm" />
      ) : (
        <span className="text-[var(--color-ink-faint)]">—</span>
      )}
      <span className="tabular text-[11px] text-[var(--color-ink-muted)]">
        {formatRelativeAge(lead.createdAt)}
      </span>
      {lead.archivedAt ? (
        <Badge tone="muted" size="sm">
          Archived
        </Badge>
      ) : null}
      {canUpdate && !lead.archivedAt && statuses.length > 0 ? (
        <RowSelect
          value={lead.status?.id ?? lead.statusId ?? ""}
          disabled={pending}
          label={`Change status for ${lead.fullName}`}
          className="max-w-[8.5rem] min-w-[6.5rem]"
          onChange={(event) => {
            const nextStatusId = event.target.value;
            if (nextStatusId && nextStatusId !== (lead.status?.id ?? lead.statusId)) {
              onStatusChange(nextStatusId);
            }
          }}
        >
          {lead.status || lead.statusId ? null : <option value="">Set status</option>}
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.label}
            </option>
          ))}
        </RowSelect>
      ) : null}
    </div>
  );
}

function OwnerCell({
  lead,
  members,
  canUpdate,
  pending,
  onAssign,
}: {
  lead: LeadTableItem;
  members: LeadTableMember[];
  canUpdate: boolean;
  pending: boolean;
  onAssign: (assignedTo: string | null) => void;
}) {
  if (!canUpdate || lead.archivedAt || members.length === 0) {
    return (
      <span className="truncate text-[var(--color-ink-soft)]">{formatOwnerName(lead.assignedUser)}</span>
    );
  }

  return (
    <RowSelect
      value={lead.assignedUser?.id ?? ""}
      disabled={pending}
      label={`Assign ${lead.fullName}`}
      onChange={(event) => onAssign(event.target.value === "" ? null : event.target.value)}
    >
      <option value="">Unassigned</option>
      {members.map((member) => (
        <option key={member.userId} value={member.userId}>
          {formatOwnerName({
            id: member.userId,
            name: member.name,
            email: member.email,
          })}
        </option>
      ))}
    </RowSelect>
  );
}

function RowActions({
  workspaceSlug,
  lead,
  canArchive,
  pending,
  onArchive,
  onRestore,
}: {
  workspaceSlug: string;
  lead: LeadTableItem;
  canArchive: boolean;
  pending: boolean;
  onArchive: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="inline-flex items-center justify-end gap-0.5">
      <Link
        href={workspacePath(workspaceSlug, "leads", lead.id)}
        className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-[12px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
        aria-label={`Open ${lead.fullName}`}
      >
        Open
        <IconChevronRight size={13} />
      </Link>
      {canArchive && lead.archivedAt ? (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" disabled={pending} onClick={onRestore}>
          Restore
        </Button>
      ) : null}
      {canArchive && !lead.archivedAt ? (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" disabled={pending} onClick={onArchive}>
          Archive
        </Button>
      ) : null}
    </div>
  );
}

function isSelectedLead(
  leadId: string,
  selectAllMatching: boolean,
  selectedLeadIds: Set<string>,
  excludedLeadIds: Set<string>,
): boolean {
  return selectAllMatching ? !excludedLeadIds.has(leadId) : selectedLeadIds.has(leadId);
}

export function LeadsTable({
  workspaceSlug,
  leads,
  statuses,
  members,
  canUpdate,
  canArchive,
  canDelete,
  selectedLeadIds,
  selectAllMatching,
  excludedLeadIds,
  allPageSelected,
  somePageSelected,
  pendingLeadId,
  onToggleLead,
  onTogglePage,
  onAssign,
  onStatusChange,
  onArchive,
  onRestore,
}: LeadsTableProps) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[1080px] w-full text-[12.5px] leading-snug">
          <thead>
            <tr className="border-b border-[var(--color-line)] bg-[var(--color-canvas)] text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              {canDelete && (
                <th className="w-9 px-2 py-1.5">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-[var(--color-line)]"
                    checked={allPageSelected}
                    ref={(element) => {
                      if (element) {
                        element.indeterminate = somePageSelected && !allPageSelected;
                      }
                    }}
                    onChange={onTogglePage}
                    aria-label="Select all leads on this page"
                  />
                </th>
              )}
              <th className="px-2 py-1.5 text-left">Lead</th>
              <th className="w-[9.5rem] px-2 py-1.5 text-left">Project</th>
              <th className="w-[10rem] px-2 py-1.5 text-left">Source</th>
              <th className="w-[11.5rem] px-2 py-1.5 text-left">Status</th>
              <th className="w-[9.5rem] px-2 py-1.5 text-left">Owner</th>
              <th className="w-[12.5rem] px-2 py-1.5 text-left">Activity</th>
              <th className="w-[8.5rem] px-2 py-1.5 text-left">Tags</th>
              <th className="w-[8.5rem] px-2 py-1.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]">
            {leads.map((lead) => {
              const pending = pendingLeadId === lead.id;
              const selected = isSelectedLead(
                lead.id,
                selectAllMatching,
                selectedLeadIds,
                excludedLeadIds,
              );

              return (
                <tr
                  key={lead.id}
                  className={cn(
                    "align-middle hover:bg-[var(--color-canvas)]",
                    selected && "bg-[var(--color-brand-50)]/40",
                    pending && "opacity-80",
                  )}
                >
                  {canDelete && (
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-[var(--color-line)]"
                        checked={selected}
                        onChange={() => onToggleLead(lead.id)}
                        aria-label={`Select ${lead.fullName}`}
                      />
                    </td>
                  )}
                  <td className="min-w-[14rem] px-2 py-1.5">
                    <Link
                      href={workspacePath(workspaceSlug, "leads", lead.id)}
                      className="block truncate font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
                    >
                      {lead.fullName}
                    </Link>
                    <div className="mt-0.5 text-[11.5px]">
                      <ContactChannels lead={lead} />
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <p className="truncate text-[var(--color-ink-soft)]">
                      {lead.project?.name ?? "—"}
                    </p>
                    {lead.project?.reference ? (
                      <p className="truncate text-[11px] text-[var(--color-ink-muted)]">
                        {lead.project.reference}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <SourceCell lead={lead} />
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusCell
                      lead={lead}
                      statuses={statuses}
                      canUpdate={canUpdate}
                      pending={pending}
                      onStatusChange={(statusId) => onStatusChange(lead.id, statusId)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <OwnerCell
                      lead={lead}
                      members={members}
                      canUpdate={canUpdate}
                      pending={pending}
                      onAssign={(assignedTo) => onAssign(lead.id, assignedTo)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <ActivityCell lead={lead} />
                  </td>
                  <td className="px-2 py-1.5">
                    <LeadTags tags={lead.tagsResolved} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <RowActions
                      workspaceSlug={workspaceSlug}
                      lead={lead}
                      canArchive={canArchive}
                      pending={pending}
                      onArchive={() => onArchive(lead.id, lead.fullName)}
                      onRestore={() => onRestore(lead.id, lead.fullName)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-[var(--color-line)] md:hidden">
        {leads.map((lead) => {
          const pending = pendingLeadId === lead.id;
          const selected = isSelectedLead(
            lead.id,
            selectAllMatching,
            selectedLeadIds,
            excludedLeadIds,
          );
          const source = formatSourceContext(lead.source?.label, lead.attributes);

          return (
            <li
              key={lead.id}
              className={cn("px-3 py-2.5", selected && "bg-[var(--color-brand-50)]/40")}
            >
              <div className="flex items-start gap-2">
                {canDelete ? (
                  <input
                    type="checkbox"
                    className="mt-1 h-3.5 w-3.5 rounded border-[var(--color-line)]"
                    checked={selected}
                    onChange={() => onToggleLead(lead.id)}
                    aria-label={`Select ${lead.fullName}`}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={workspacePath(workspaceSlug, "leads", lead.id)}
                      className="min-w-0 truncate font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
                    >
                      {lead.fullName}
                    </Link>
                    <span className="shrink-0 tabular text-[11px] text-[var(--color-ink-muted)]">
                      {formatRelativeAge(lead.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11.5px]">
                    <ContactChannels lead={lead} />
                  </div>
                  <p className="mt-1 truncate text-[11.5px] text-[var(--color-ink-muted)]">
                    {[lead.project?.name, source.source, source.context]
                      .filter((value) => value && value !== "—")
                      .join(" · ") || "No project or source"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {lead.status ? (
                      <StatusBadge label={lead.status.label} color={lead.status.color} size="sm" />
                    ) : null}
                    <span className="text-[11.5px] text-[var(--color-ink-soft)]">
                      {formatOwnerName(lead.assignedUser)}
                    </span>
                    <LeadTags tags={lead.tagsResolved} />
                  </div>
                  <div className="mt-1 text-[11.5px]">
                    <ActivityCell lead={lead} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {canUpdate && !lead.archivedAt && statuses.length > 0 ? (
                      <RowSelect
                        value={lead.status?.id ?? lead.statusId ?? ""}
                        disabled={pending}
                        label={`Change status for ${lead.fullName}`}
                        onChange={(event) => {
                          const nextStatusId = event.target.value;
                          if (nextStatusId && nextStatusId !== (lead.status?.id ?? lead.statusId)) {
                            onStatusChange(lead.id, nextStatusId);
                          }
                        }}
                      >
                        {lead.status || lead.statusId ? null : <option value="">Set status</option>}
                        {statuses.map((status) => (
                          <option key={status.id} value={status.id}>
                            {status.label}
                          </option>
                        ))}
                      </RowSelect>
                    ) : null}
                    {canUpdate && !lead.archivedAt && members.length > 0 ? (
                      <RowSelect
                        value={lead.assignedUser?.id ?? ""}
                        disabled={pending}
                        label={`Assign ${lead.fullName}`}
                        onChange={(event) =>
                          onAssign(lead.id, event.target.value === "" ? null : event.target.value)
                        }
                      >
                        <option value="">Unassigned</option>
                        {members.map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {formatOwnerName({
                              id: member.userId,
                              name: member.name,
                              email: member.email,
                            })}
                          </option>
                        ))}
                      </RowSelect>
                    ) : null}
                    <RowActions
                      workspaceSlug={workspaceSlug}
                      lead={lead}
                      canArchive={canArchive}
                      pending={pending}
                      onArchive={() => onArchive(lead.id, lead.fullName)}
                      onRestore={() => onRestore(lead.id, lead.fullName)}
                    />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
