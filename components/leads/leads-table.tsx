"use client";

import Link from "next/link";
import { Fragment, useState, type ChangeEvent, type ReactNode } from "react";

import { StatusBadge } from "@/components/domain/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { isValidHexColor } from "@/lib/dictionary-colors";
import { IconChevronDown, IconChevronRight, IconMail, IconPhone } from "@/lib/icons";
import {
  formatLeadRoleLine,
  formatNextStepCell,
  formatOwnerName,
  formatProjectMembershipCell,
  formatRelativeAge,
  formatSourceContext,
  formatUtmTitle,
  leadUrgency,
  telHref,
  visibleLeadTags,
} from "@/lib/leads-table";
import { LeadProjectMemberships } from "@/components/leads/lead-project-memberships";
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
  "h-7 max-w-[10rem] min-w-[7rem] appearance-none truncate rounded border border-[var(--color-line)] bg-white bg-[length:12px_12px] bg-[right_0.4rem_center] bg-no-repeat px-2 pr-6 text-[12px] text-[var(--color-ink)] focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-100)] disabled:opacity-60";

function RowSelect({
  value,
  disabled,
  label,
  onChange,
  children,
}: {
  value: string;
  disabled?: boolean;
  label: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onChange={onChange}
      className={compactSelectClass}
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
      className="inline-flex max-w-[6.5rem] truncate rounded border px-1.5 py-px text-[10.5px] font-medium leading-4"
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

function LeadTags({ tags, max = 1 }: { tags: LeadTableItem["tagsResolved"]; max?: number }) {
  if (tags.length === 0) {
    return <span className="text-[var(--color-ink-faint)]">—</span>;
  }

  const { visible, overflow } = visibleLeadTags(tags, max);

  return (
    <div className="flex min-w-0 items-center gap-1">
      {visible.map((tag) => (
        <TagChip key={tag.id} tag={tag} />
      ))}
      {overflow > 0 ? (
        <span
          className="text-[10.5px] font-medium text-[var(--color-ink-muted)]"
          title={tags
            .slice(max)
            .map((tag) => tag.name)
            .join(", ")}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function ContactPopover({ lead }: { lead: LeadTableItem }) {
  if (!lead.email && !lead.phone) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center text-[var(--color-ink-faint)]"
        title="No contact"
        aria-label={`No contact for ${lead.fullName}`}
      >
        —
      </span>
    );
  }

  return (
    <Dropdown
      align="left"
      trigger={
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
          aria-label={`Contact ${lead.fullName}`}
        >
          {lead.email ? <IconMail size={13} /> : <IconPhone size={13} />}
        </button>
      }
    >
      <div className="flex min-w-[12rem] flex-col gap-0.5 p-0.5">
        {lead.email ? (
          <a
            role="menuitem"
            href={`mailto:${lead.email}`}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-[var(--color-ink)] hover:bg-[var(--color-muted)]"
          >
            <IconMail size={13} className="shrink-0 text-[var(--color-ink-muted)]" />
            <span className="truncate">{lead.email}</span>
          </a>
        ) : null}
        {lead.phone ? (
          <a
            role="menuitem"
            href={telHref(lead.phone)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-[var(--color-ink)] hover:bg-[var(--color-muted)]"
          >
            <IconPhone size={13} className="shrink-0 text-[var(--color-ink-muted)]" />
            <span>{lead.phone}</span>
          </a>
        ) : null}
      </div>
    </Dropdown>
  );
}

function StatusSelect({
  lead,
  statuses,
  pending,
  onStatusChange,
}: {
  lead: LeadTableItem;
  statuses: LeadTableDictionaryItem[];
  pending: boolean;
  onStatusChange: (statusId: string) => void;
}) {
  return (
    <RowSelect
      value={lead.status?.id ?? lead.statusId ?? ""}
      disabled={pending}
      label={`Change status for ${lead.fullName}`}
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
  );
}

function AssignSelect({
  lead,
  members,
  pending,
  onAssign,
}: {
  lead: LeadTableItem;
  members: LeadTableMember[];
  pending: boolean;
  onAssign: (assignedTo: string | null) => void;
}) {
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

function UrgencyBadge({ lead }: { lead: LeadTableItem }) {
  const urgency = leadUrgency(lead);
  if (!urgency.label) {
    return <span className="text-[var(--color-ink-faint)]">—</span>;
  }

  return (
    <Badge tone={urgency.tone} size="sm">
      {urgency.label}
    </Badge>
  );
}

function NextStepCell({ lead }: { lead: LeadTableItem }) {
  const step = formatNextStepCell(lead);
  const urgency = leadUrgency(lead);
  const hot = urgency.level === "overdue" || urgency.level === "today";

  return (
    <p
      className={cn(
        "truncate",
        step.kind === "empty" && "text-[var(--color-ink-faint)]",
        step.kind === "last" && "text-[var(--color-ink-muted)]",
        step.kind === "next" && (hot ? "font-medium text-[var(--color-danger-fg)]" : "text-[var(--color-ink-soft)]"),
      )}
      title={step.text}
    >
      {step.text}
    </p>
  );
}

function RowActions({
  workspaceSlug,
  lead,
  expanded,
  onToggleExpanded,
}: {
  workspaceSlug: string;
  lead: LeadTableItem;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  return (
    <div className="inline-flex items-center justify-end gap-0.5">
      <button
        type="button"
        className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
        aria-expanded={expanded}
        aria-label={expanded ? `Hide details for ${lead.fullName}` : `Show details for ${lead.fullName}`}
        onClick={onToggleExpanded}
      >
        {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
      </button>
      <Link
        href={workspacePath(workspaceSlug, "leads", lead.id)}
        className="inline-flex h-6 items-center rounded px-1.5 text-[12px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
        aria-label={`Open ${lead.fullName}`}
      >
        Open
      </Link>
    </div>
  );
}

function ExpandedDetails({
  lead,
  statuses,
  members,
  canUpdate,
  canArchive,
  pending,
  onAssign,
  onStatusChange,
  onArchive,
  onRestore,
}: {
  lead: LeadTableItem;
  statuses: LeadTableDictionaryItem[];
  members: LeadTableMember[];
  canUpdate: boolean;
  canArchive: boolean;
  pending: boolean;
  onAssign: (assignedTo: string | null) => void;
  onStatusChange: (statusId: string) => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const source = formatSourceContext(lead.source?.label, lead.attributes);
  const utmTitle = formatUtmTitle(lead.attributes);
  const last = formatNextStepCell({
    lastActivity: lead.lastActivity,
    lastContactedAt: lead.lastContactedAt,
  });

  return (
    <div className="grid gap-3 px-3 py-2.5 text-[12.5px] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-1 text-[var(--color-ink-soft)]">
        {lead.email ? (
          <p>
            <a className="hover:text-[var(--color-brand-700)]" href={`mailto:${lead.email}`}>
              {lead.email}
            </a>
          </p>
        ) : null}
        {lead.phone ? (
          <p>
            <a className="hover:text-[var(--color-brand-700)]" href={telHref(lead.phone)}>
              {lead.phone}
            </a>
          </p>
        ) : null}
        {utmTitle ? <p title={utmTitle}>UTM {source.context}</p> : null}
        {last.kind === "last" ? <p>{last.text}</p> : null}
        {lead.industry ? <p>Industry {lead.industry}</p> : null}
        {lead.stateRegion ? <p>State / region {lead.stateRegion}</p> : null}
        {lead.tagsResolved.length > 0 ? <LeadTags tags={lead.tagsResolved} max={6} /> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {canUpdate && !lead.archivedAt && statuses.length > 0 ? (
          <StatusSelect
            lead={lead}
            statuses={statuses}
            pending={pending}
            onStatusChange={onStatusChange}
          />
        ) : null}
        {canUpdate && !lead.archivedAt && members.length > 0 ? (
          <AssignSelect lead={lead} members={members} pending={pending} onAssign={onAssign} />
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-1">
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
  const [expandedLeadIds, setExpandedLeadIds] = useState<Set<string>>(() => new Set());
  const columnCount = (canDelete ? 1 : 0) + 11;

  function toggleExpanded(leadId: string) {
    setExpandedLeadIds((current) => {
      const next = new Set(current);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[1120px] w-full text-[12.5px] leading-none">
          <thead>
            <tr className="border-b border-[var(--color-line)] bg-[var(--color-canvas)] text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              {canDelete && (
                <th className="w-8 px-1.5 py-1">
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
              <th className="px-1.5 py-1 text-left">Lead</th>
              <th className="w-[8.5rem] px-1.5 py-1 text-left">Company</th>
              <th className="w-[8.5rem] px-1.5 py-1 text-left">Project</th>
              <th className="w-[7.5rem] px-1.5 py-1 text-left">Source</th>
              <th className="w-[7.5rem] px-1.5 py-1 text-left">Status</th>
              <th className="w-[7.5rem] px-1.5 py-1 text-left">Owner</th>
              <th className="w-[3.25rem] px-1.5 py-1 text-left">Age</th>
              <th className="w-[12rem] px-1.5 py-1 text-left">Next</th>
              <th className="w-[5.5rem] px-1.5 py-1 text-left">Urgency</th>
              <th className="w-[6.5rem] px-1.5 py-1 text-left">Tags</th>
              <th className="w-[5.5rem] px-1.5 py-1 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const pending = pendingLeadId === lead.id;
              const selected = isSelectedLead(
                lead.id,
                selectAllMatching,
                selectedLeadIds,
                excludedLeadIds,
              );
              const expanded = expandedLeadIds.has(lead.id);
              const urgency = leadUrgency(lead);
              const source = formatSourceContext(lead.source?.label, lead.attributes);
              const utmTitle = formatUtmTitle(lead.attributes);

              return (
                <Fragment key={lead.id}>
                  <tr
                    className={cn(
                      "border-b border-[var(--color-line)]",
                      selected && "bg-[var(--color-brand-50)]/40",
                      pending && "opacity-80",
                      urgency.level === "overdue" && "bg-[var(--color-danger-bg)]/40",
                      urgency.level === "today" && "bg-[var(--color-warn-bg)]/30",
                      expanded && "border-b-0",
                    )}
                  >
                    {canDelete && (
                      <td className="px-1.5 py-1">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-[var(--color-line)]"
                          checked={selected}
                          onChange={() => onToggleLead(lead.id)}
                          aria-label={`Select ${lead.fullName}`}
                        />
                      </td>
                    )}
                    <td className="min-w-[11rem] px-1.5 py-1">
                      <div className="flex min-w-0 items-center gap-1">
                        <Link
                          href={workspacePath(workspaceSlug, "leads", lead.id)}
                          className="min-w-0 truncate font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
                        >
                          {lead.fullName}
                        </Link>
                        <ContactPopover lead={lead} />
                      </div>
                      {formatLeadRoleLine(lead) ? (
                        <p className="mt-0.5 truncate text-[11px] text-[var(--color-ink-muted)]">
                          {formatLeadRoleLine(lead)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-1.5 py-1">
                      <p className="truncate text-[var(--color-ink-soft)]" title={lead.company?.name ?? undefined}>
                        {lead.company?.name ?? "—"}
                      </p>
                    </td>
                    <td className="px-1.5 py-1">
                      <p
                        className="truncate text-[var(--color-ink-soft)]"
                        title={
                          formatProjectMembershipCell({
                            primaryName: lead.project
                              ? [lead.project.name, lead.project.reference]
                                  .filter(Boolean)
                                  .join(" · ")
                              : null,
                            secondaryCount: lead.secondaryProjects?.length ?? 0,
                          }).text
                        }
                      >
                        {lead.projectMemberships && lead.projectMemberships.length > 0 ? (
                          <LeadProjectMemberships
                            memberships={lead.projectMemberships}
                            compact
                          />
                        ) : (
                          lead.project?.name ?? "—"
                        )}
                      </p>
                    </td>
                    <td className="px-1.5 py-1">
                      <p className="truncate text-[var(--color-ink-soft)]" title={utmTitle ?? source.source}>
                        {source.source}
                      </p>
                    </td>
                    <td className="px-1.5 py-1">
                      <div className="flex items-center gap-1">
                        {lead.status ? (
                          <StatusBadge label={lead.status.label} color={lead.status.color} size="sm" />
                        ) : (
                          <span className="text-[var(--color-ink-faint)]">—</span>
                        )}
                        {lead.archivedAt ? (
                          <Badge tone="muted" size="sm">
                            Archived
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-1.5 py-1">
                      <p className="truncate text-[var(--color-ink-soft)]" title={formatOwnerName(lead.assignedUser)}>
                        {formatOwnerName(lead.assignedUser)}
                      </p>
                    </td>
                    <td className="px-1.5 py-1 tabular text-[var(--color-ink-muted)]">
                      {formatRelativeAge(lead.createdAt)}
                    </td>
                    <td className="px-1.5 py-1">
                      <NextStepCell lead={lead} />
                    </td>
                    <td className="px-1.5 py-1">
                      <UrgencyBadge lead={lead} />
                    </td>
                    <td className="px-1.5 py-1">
                      <LeadTags tags={lead.tagsResolved} />
                    </td>
                    <td className="px-1.5 py-1 text-right">
                      <RowActions
                        workspaceSlug={workspaceSlug}
                        lead={lead}
                        expanded={expanded}
                        onToggleExpanded={() => toggleExpanded(lead.id)}
                      />
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="border-b border-[var(--color-line)] bg-[var(--color-canvas)]">
                      <td colSpan={columnCount}>
                        <ExpandedDetails
                          lead={lead}
                          statuses={statuses}
                          members={members}
                          canUpdate={canUpdate}
                          canArchive={canArchive}
                          pending={pending}
                          onAssign={(assignedTo) => onAssign(lead.id, assignedTo)}
                          onStatusChange={(statusId) => onStatusChange(lead.id, statusId)}
                          onArchive={() => onArchive(lead.id, lead.fullName)}
                          onRestore={() => onRestore(lead.id, lead.fullName)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
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
          const expanded = expandedLeadIds.has(lead.id);
          const source = formatSourceContext(lead.source?.label, lead.attributes);
          const urgency = leadUrgency(lead);

          return (
            <li
              key={lead.id}
              className={cn(
                "px-3 py-2",
                selected && "bg-[var(--color-brand-50)]/40",
                urgency.level === "overdue" && "bg-[var(--color-danger-bg)]/40",
              )}
            >
              <div className="flex items-center gap-2">
                {canDelete ? (
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-[var(--color-line)]"
                    checked={selected}
                    onChange={() => onToggleLead(lead.id)}
                    aria-label={`Select ${lead.fullName}`}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={workspacePath(workspaceSlug, "leads", lead.id)}
                      className="min-w-0 truncate font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
                    >
                      {lead.fullName}
                    </Link>
                    <ContactPopover lead={lead} />
                    <span className="ml-auto shrink-0 tabular text-[11px] text-[var(--color-ink-muted)]">
                      {formatRelativeAge(lead.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {lead.status ? (
                      <StatusBadge label={lead.status.label} color={lead.status.color} size="sm" />
                    ) : null}
                    <UrgencyBadge lead={lead} />
                    <span className="truncate text-[11.5px] text-[var(--color-ink-soft)]">
                      {formatOwnerName(lead.assignedUser)}
                    </span>
                    {formatLeadRoleLine(lead) ? (
                      <span className="truncate text-[11.5px] text-[var(--color-ink-muted)]">
                        {formatLeadRoleLine(lead)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1">
                    <NextStepCell lead={lead} />
                  </div>
                </div>
                <RowActions
                  workspaceSlug={workspaceSlug}
                  lead={lead}
                  expanded={expanded}
                  onToggleExpanded={() => toggleExpanded(lead.id)}
                />
              </div>
              {expanded ? (
                <div className="mt-2 border-t border-[var(--color-line)] pt-2">
                  <p className="mb-2 truncate text-[11.5px] text-[var(--color-ink-muted)]">
                    {[
                      formatProjectMembershipCell({
                        primaryName: lead.project?.name,
                        secondaryCount: lead.secondaryProjects?.length ?? 0,
                      }).text,
                      source.source,
                      source.context,
                    ]
                      .filter((value) => value && value !== "—")
                      .join(" · ") || "No project or source"}
                  </p>
                  <ExpandedDetails
                    lead={lead}
                    statuses={statuses}
                    members={members}
                    canUpdate={canUpdate}
                    canArchive={canArchive}
                    pending={pending}
                    onAssign={(assignedTo) => onAssign(lead.id, assignedTo)}
                    onStatusChange={(statusId) => onStatusChange(lead.id, statusId)}
                    onArchive={() => onArchive(lead.id, lead.fullName)}
                    onRestore={() => onRestore(lead.id, lead.fullName)}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
