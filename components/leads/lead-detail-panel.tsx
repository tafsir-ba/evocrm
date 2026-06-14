"use client";

import { useCallback, useEffect, useState } from "react";

import { OpportunitiesSection } from "@/components/opportunities/opportunities-section";
import { ActivitiesSection } from "@/components/activities/activities-section";
import { DocumentsSection } from "@/components/documents/documents-section";
import { MemberSelector, type MemberSelectorMember } from "@/components/domain/member-selector";
import { StatusBadge } from "@/components/domain/status-badge";
import { TagSelector, type TagSelectorTag } from "@/components/domain/tag-selector";
import { PageHeader } from "@/components/layout/page-header";
import { StateView } from "@/components/states/state-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import {
  IconCalendar,
  IconMail,
  IconMapPin,
  IconPhone,
} from "@/lib/icons";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
};

type LeadDetail = {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  language: string | null;
  preferredContactMethod: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  preferredAreas: string[];
  notes: string | null;
  createdAt: string;
  status: DictionaryItem | null;
  source: DictionaryItem | null;
  tagsResolved: Array<{ id: string; name: string; color: string }>;
  tags: string[];
  assignedUser: { id: string; name: string | null; email: string } | null;
  statusId: string;
  sourceId: string | null;
};

type LeadFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  statusId: string;
  sourceId: string;
  language: string;
  preferredContactMethod: string;
  budgetMin: string;
  budgetMax: string;
  preferredAreas: string;
  notes: string;
  tagIds: string[];
  assignedTo: string;
};

type LeadDetailPanelProps = {
  workspaceSlug: string;
  leadId: string;
  defaultCurrency: string;
  workspaceTimezone: string;
  canUpdate: boolean;
  canArchive: boolean;
  canReadOpportunities: boolean;
  canCreateOpportunity: boolean;
  canReadActivities: boolean;
  canCreateActivity: boolean;
  canUpdateActivity: boolean;
  canArchiveActivity: boolean;
  canReadDocuments: boolean;
  canCreateDocument: boolean;
  canArchiveDocument: boolean;
};

export function LeadDetailPanel({
  workspaceSlug,
  leadId,
  defaultCurrency,
  workspaceTimezone,
  canUpdate,
  canArchive,
  canReadOpportunities,
  canCreateOpportunity,
  canReadActivities,
  canCreateActivity,
  canUpdateActivity,
  canArchiveActivity,
  canReadDocuments,
  canCreateDocument,
  canArchiveDocument,
}: LeadDetailPanelProps) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [sources, setSources] = useState<DictionaryItem[]>([]);
  const [tags, setTags] = useState<TagSelectorTag[]>([]);
  const [members, setMembers] = useState<MemberSelectorMember[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<LeadFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formWarning, setFormWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const apiBase = `/api/workspaces/${workspaceSlug}`;

  const loadLead = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    setNotFound(false);

    try {
      const response = await fetch(`${apiBase}/leads/${leadId}`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load lead.");
      }

      setLead(payload.data.lead as LeadDetail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, leadId]);

  const loadOptions = useCallback(async () => {
    try {
      const [statusRes, sourceRes, tagsRes, membersRes] = await Promise.all([
        fetch(`${apiBase}/dictionary-items?type=lead_status`),
        fetch(`${apiBase}/dictionary-items?type=lead_source`),
        fetch(`${apiBase}/tags?entityType=lead`),
        fetch(`${apiBase}/members`),
      ]);
      const [statusPayload, sourcePayload, tagsPayload, membersPayload] = await Promise.all([
        statusRes.json(),
        sourceRes.json(),
        tagsRes.json(),
        membersRes.json(),
      ]);
      if (statusRes.ok) {
        setStatuses(statusPayload.data.items as DictionaryItem[]);
      }
      if (sourceRes.ok) {
        setSources(sourcePayload.data.items as DictionaryItem[]);
      }
      if (tagsRes.ok) {
        setTags(tagsPayload.data.tags as TagSelectorTag[]);
      }
      if (membersRes.ok) {
        setMembers(membersPayload.data.members as MemberSelectorMember[]);
      }
    } catch {
      // Non-blocking.
    }
  }, [apiBase]);

  useEffect(() => {
    void loadLead();
    void loadOptions();
  }, [loadLead, loadOptions]);

  function openEditDrawer() {
    if (!lead) {
      return;
    }
    setFormError(null);
    setFormWarning(null);
    setForm({
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      statusId: lead.statusId,
      sourceId: lead.sourceId ?? "",
      language: lead.language ?? "",
      preferredContactMethod: lead.preferredContactMethod ?? "",
      budgetMin: lead.budgetMin?.toString() ?? "",
      budgetMax: lead.budgetMax?.toString() ?? "",
      preferredAreas: lead.preferredAreas.join(", "),
      notes: lead.notes ?? "",
      tagIds: lead.tags,
      assignedTo: lead.assignedUser?.id ?? "",
    });
    setDrawerOpen(true);
  }

  function toggleTag(tagId: string) {
    setForm((current) =>
      current
        ? {
            ...current,
            tagIds: current.tagIds.includes(tagId)
              ? current.tagIds.filter((id) => id !== tagId)
              : [...current.tagIds, tagId],
          }
        : current,
    );
  }

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!form) {
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFormWarning(null);

    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        statusId: form.statusId,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        sourceId: form.sourceId || null,
        language: form.language.trim() || null,
        preferredContactMethod: form.preferredContactMethod || null,
        budgetMin: form.budgetMin ? Number(form.budgetMin) : null,
        budgetMax: form.budgetMax ? Number(form.budgetMax) : null,
        preferredAreas: form.preferredAreas
          ? form.preferredAreas.split(",").map((area) => area.trim()).filter(Boolean)
          : [],
        notes: form.notes.trim() || null,
        tags: form.tagIds,
        assignedTo: form.assignedTo || null,
      };

      const response = await fetch(`${apiBase}/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error?.message ?? "Failed to update lead.");
      }

      if (body.data.warnings?.includes("duplicate_phone")) {
        setFormWarning("A lead with this phone number already exists in this workspace.");
      }

      setLead(body.data.lead as LeadDetail);
      if (!body.data.warnings?.length) {
        setDrawerOpen(false);
      }
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : "Failed to update.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    if (!lead || !canArchive) {
      return;
    }
    if (!window.confirm(`Archive lead "${lead.fullName}"?`)) {
      return;
    }

    const response = await fetch(`${apiBase}/leads/${leadId}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      window.alert(body.error?.message ?? "Failed to archive lead.");
      return;
    }

    window.location.href = workspacePath(workspaceSlug, "leads");
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatBudget(min: number | null, max: number | null) {
    if (min === null && max === null) {
      return "—";
    }
    if (min !== null && max !== null) {
      return `${min.toLocaleString()} – ${max.toLocaleString()}`;
    }
    return (min ?? max)?.toLocaleString() ?? "—";
  }

  if (forbidden) {
    return (
      <PermissionDenied
        title="Lead unavailable"
        description="You do not have permission to view this lead."
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (notFound) {
    return (
      <StateView
        variant="empty"
        title="Lead not found"
        description="This lead does not exist in this workspace or may have been archived."
        primaryAction={{
          label: "Back to leads",
          onClick: () => {
            window.location.href = workspacePath(workspaceSlug, "leads");
          },
        }}
      />
    );
  }

  if (error || !lead) {
    return (
      <ErrorState
        title="Could not load lead"
        description={error ?? "Failed to load lead."}
        primaryAction={{ label: "Retry", onClick: () => void loadLead() }}
      />
    );
  }

  const initials = lead.fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <PageHeader
        back={{
          href: workspacePath(workspaceSlug, "leads"),
          label: "Back to leads",
        }}
        title={
          <span className="flex items-center gap-2.5 flex-wrap">
            {lead.fullName}
            {lead.status && (
              <StatusBadge
                label={lead.status.label}
                color={lead.status.color}
                size="sm"
              />
            )}
          </span>
        }
        description={`${lead.source?.label ?? "No source"} · Created ${formatDate(lead.createdAt)}`}
        actions={
          <>
            {canUpdate && (
              <Button variant="secondary" onClick={openEditDrawer}>
                Edit
              </Button>
            )}
            {canArchive && (
              <Button variant="ghost" onClick={() => void handleArchive()}>
                Archive
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-1">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)] text-[14px] font-semibold">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-[var(--color-ink)] truncate">
                {lead.fullName}
              </p>
              <p className="text-[12.5px] text-[var(--color-ink-muted)]">Lead · {lead.id}</p>
            </div>
          </div>

          <div className="mt-5 space-y-2.5 text-[13px]">
            <Row icon={<IconMail size={14} />} label="Email">
              {lead.email ? (
                <a
                  className="text-[var(--color-brand-700)] hover:underline truncate"
                  href={`mailto:${lead.email}`}
                >
                  {lead.email}
                </a>
              ) : (
                "—"
              )}
            </Row>
            <Row icon={<IconPhone size={14} />} label="Phone">
              {lead.phone ?? "—"}
            </Row>
            <Row icon={<IconMapPin size={14} />} label="Preferred areas">
              {lead.preferredAreas.length > 0 ? lead.preferredAreas.join(", ") : "—"}
            </Row>
            <Row icon={<IconCalendar size={14} />} label="Created">
              {formatDate(lead.createdAt)}
            </Row>
          </div>

          <div className="border-t border-[var(--color-line)] my-5" />

          <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-3">
            Assigned to
          </p>
          <p className="text-[13px] text-[var(--color-ink)]">
            {lead.assignedUser?.name ?? lead.assignedUser?.email ?? "Unassigned"}
          </p>

          {lead.tagsResolved.length > 0 && (
            <>
              <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mt-5 mb-2">
                Tags
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {lead.tagsResolved.map((tag) => (
                  <Badge key={tag.id} tone="muted">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </>
          )}

          {lead.notes && (
            <>
              <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mt-5 mb-2">
                Notes
              </p>
              <p className="text-[13px] text-[var(--color-ink-soft)] whitespace-pre-wrap">
                {lead.notes}
              </p>
            </>
          )}
        </Card>

        <div className="xl:col-span-2">
          <Card padded={false}>
            <Tabs
              className="px-5"
              items={[
                {
                  key: "overview",
                  label: "Overview",
                  content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-5 px-5">
                      <Info label="Budget" value={formatBudget(lead.budgetMin, lead.budgetMax)} />
                      <Info label="Language" value={lead.language ?? "—"} />
                      <Info
                        label="Preferred contact"
                        value={lead.preferredContactMethod ?? "—"}
                      />
                      <Info
                        label="Preferred areas"
                        value={
                          lead.preferredAreas.length > 0
                            ? lead.preferredAreas.join(", ")
                            : "—"
                        }
                      />
                      <Info label="Source" value={lead.source?.label ?? "—"} />
                      <Info label="Status" value={lead.status?.label ?? "—"} />
                    </div>
                  ),
                },
                {
                  key: "opps",
                  label: "Opportunities",
                  content: (
                    <OpportunitiesSection
                      workspaceSlug={workspaceSlug}
                      defaultCurrency={defaultCurrency}
                      leadId={leadId}
                      canRead={canReadOpportunities}
                      canCreate={canCreateOpportunity}
                    />
                  ),
                },
                {
                  key: "acts",
                  label: "Activities",
                  content: (
                    <ActivitiesSection
                      workspaceSlug={workspaceSlug}
                      workspaceTimezone={workspaceTimezone}
                      leadId={leadId}
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
                        description="Use the internal notes field on the lead record for now. Persisted timeline notes arrive in a later phase."
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
                      linkedEntityType="lead"
                      linkedEntityId={leadId}
                      canRead={canReadDocuments}
                      canCreate={canCreateDocument}
                      canArchive={canArchiveDocument}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Edit lead"
        className="w-[min(100%,420px)]"
        footer={
          form ? (
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDrawerOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="edit-lead-form" disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </div>
          ) : undefined
        }
      >
        {form && (
          <form id="edit-lead-form" className="space-y-4" onSubmit={(event) => void handleUpdate(event)}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-firstName" required>
                  First name
                </Label>
                <Input
                  id="edit-firstName"
                  value={form.firstName}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, firstName: event.target.value } : current,
                    )
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-lastName" required>
                  Last name
                </Label>
                <Input
                  id="edit-lastName"
                  value={form.lastName}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, lastName: event.target.value } : current,
                    )
                  }
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, email: event.target.value } : current,
                  )
                }
              />
            </div>

            <div>
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={form.phone}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, phone: event.target.value } : current,
                  )
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-statusId" required>
                  Status
                </Label>
                <Select
                  id="edit-statusId"
                  value={form.statusId}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, statusId: event.target.value } : current,
                    )
                  }
                  required
                >
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-sourceId">Source</Label>
                <Select
                  id="edit-sourceId"
                  value={form.sourceId}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, sourceId: event.target.value } : current,
                    )
                  }
                >
                  <option value="">No source</option>
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="edit-assignedTo">Assigned to</Label>
              <MemberSelector
                members={members}
                selectedUserId={form.assignedTo || null}
                onChange={(userId) =>
                  setForm((current) =>
                    current ? { ...current, assignedTo: userId ?? "" } : current,
                  )
                }
                placeholder="Unassigned"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-language">Language</Label>
                <Input
                  id="edit-language"
                  value={form.language}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, language: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-preferredContactMethod">Preferred contact</Label>
                <Select
                  id="edit-preferredContactMethod"
                  value={form.preferredContactMethod}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, preferredContactMethod: event.target.value }
                        : current,
                    )
                  }
                >
                  <option value="">Not set</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-budgetMin">Budget min</Label>
                <Input
                  id="edit-budgetMin"
                  type="number"
                  min={0}
                  value={form.budgetMin}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, budgetMin: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-budgetMax">Budget max</Label>
                <Input
                  id="edit-budgetMax"
                  type="number"
                  min={0}
                  value={form.budgetMax}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, budgetMax: event.target.value } : current,
                    )
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-preferredAreas">Preferred areas</Label>
              <Input
                id="edit-preferredAreas"
                placeholder="Geneva, Nyon"
                value={form.preferredAreas}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, preferredAreas: event.target.value } : current,
                  )
                }
              />
            </div>

            <div>
              <Label>Tags</Label>
              <TagSelector
                tags={tags}
                entityType="lead"
                selectedTagIds={form.tagIds}
                onToggle={toggleTag}
              />
            </div>

            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={form.notes}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, notes: event.target.value } : current,
                  )
                }
                rows={4}
              />
            </div>

            {formError && (
              <p className="text-[13px] text-[var(--color-danger-fg)]">{formError}</p>
            )}
            {formWarning && (
              <p className="text-[13px] text-[var(--color-warning-fg,#b45309)]">
                {formWarning}
              </p>
            )}
          </form>
        )}
      </Drawer>
    </>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-[var(--color-ink-muted)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-faint)] font-semibold">
          {label}
        </p>
        <p className="text-[13px] text-[var(--color-ink)] truncate">{children}</p>
      </div>
    </div>
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
