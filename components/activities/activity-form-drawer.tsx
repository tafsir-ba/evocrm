"use client";

import { useEffect, useMemo, useState } from "react";

import { MemberSelector, type MemberSelectorMember } from "@/components/domain/member-selector";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  fromDatetimeLocalInWorkspaceTimezone,
  toDatetimeLocalInWorkspaceTimezone,
} from "@/lib/workspace-datetime";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
  isDefault?: boolean;
  behavior?: string;
};

export type ActivityFormContext = {
  leadId?: string;
  propertyId?: string;
  opportunityId?: string;
};

type ActivityFormDrawerProps = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  workspaceTimezone: string;
  context?: ActivityFormContext;
  activityId?: string;
  onSaved: () => void;
};

type FormState = {
  typeId: string;
  statusId: string;
  title: string;
  description: string;
  dueDate: string;
  nextActionDate: string;
  assignedTo: string;
  outcome: string;
};

const emptyForm: FormState = {
  typeId: "",
  statusId: "",
  title: "",
  description: "",
  dueDate: "",
  nextActionDate: "",
  assignedTo: "",
  outcome: "",
};

export function ActivityFormDrawer({
  open,
  onClose,
  workspaceSlug,
  workspaceTimezone,
  context,
  activityId,
  onSaved,
}: ActivityFormDrawerProps) {
  const [types, setTypes] = useState<DictionaryItem[]>([]);
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [members, setMembers] = useState<MemberSelectorMember[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const isEdit = Boolean(activityId);
  const hasLinkContext = Boolean(
    context?.leadId || context?.propertyId || context?.opportunityId,
  );

  const defaultTypeId = useMemo(
    () => types.find((item) => item.isDefault)?.id ?? types[0]?.id ?? "",
    [types],
  );

  const defaultStatusId = useMemo(
    () =>
      statuses.find((item) => item.behavior === "pending" && item.isDefault)?.id ??
      statuses.find((item) => item.behavior === "pending")?.id ??
      statuses[0]?.id ??
      "",
    [statuses],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    async function loadOptions() {
      setLoading(true);
      setError(null);

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
        setError("Failed to load form options.");
      } finally {
        setLoading(false);
      }
    }

    void loadOptions();
  }, [apiBase, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!activityId) {
      setForm({
        ...emptyForm,
        typeId: defaultTypeId,
        statusId: defaultStatusId,
      });
      return;
    }

    async function loadActivity() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiBase}/activities/${activityId}`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error?.message ?? "Failed to load activity.");
        }

        const activity = payload.data.activity as {
          title: string;
          description: string | null;
          typeId: string;
          statusId: string;
          dueDate: string | null;
          nextActionDate: string | null;
          assignedTo: string | null;
          outcome: string | null;
        };

        setForm({
          typeId: activity.typeId,
          statusId: activity.statusId,
          title: activity.title,
          description: activity.description ?? "",
          dueDate: toDatetimeLocalInWorkspaceTimezone(activity.dueDate, workspaceTimezone),
          nextActionDate: toDatetimeLocalInWorkspaceTimezone(
            activity.nextActionDate,
            workspaceTimezone,
          ),
          assignedTo: activity.assignedTo ?? "",
          outcome: activity.outcome ?? "",
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load activity.");
      } finally {
        setLoading(false);
      }
    }

    void loadActivity();
  }, [activityId, apiBase, defaultStatusId, defaultTypeId, open, workspaceTimezone]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        typeId: form.typeId,
        statusId: form.statusId,
        title: form.title,
        description: form.description.trim() || undefined,
        dueDate: fromDatetimeLocalInWorkspaceTimezone(form.dueDate, workspaceTimezone),
        nextActionDate: fromDatetimeLocalInWorkspaceTimezone(
          form.nextActionDate,
          workspaceTimezone,
        ),
        assignedTo: form.assignedTo || undefined,
        outcome: form.outcome.trim() || undefined,
      };

      if (!isEdit) {
        if (context?.opportunityId) {
          payload.opportunityId = context.opportunityId;
        } else if (context?.leadId) {
          payload.leadId = context.leadId;
        } else if (context?.propertyId) {
          payload.propertyId = context.propertyId;
        }
      }

      const response = await fetch(
        isEdit ? `${apiBase}/activities/${activityId}` : `${apiBase}/activities`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error?.message ?? "Failed to save activity.");
      }

      onSaved();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit activity" : "New activity"}
      className="w-[min(100%,420px)]"
    >
      {loading && !form.title && isEdit ? (
        <p className="text-[13px] text-[var(--color-ink-muted)]">Loading…</p>
      ) : (
        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          {!isEdit && !hasLinkContext && (
            <p className="text-[12px] text-[var(--color-ink-muted)] rounded-lg border border-dashed border-[var(--color-line-strong)] px-3 py-2">
              Open this form from a Lead, Property, or Opportunity detail page to link the
              activity automatically.
            </p>
          )}

          <p className="text-[12px] text-[var(--color-ink-muted)]">
            Due dates use workspace timezone ({workspaceTimezone}). Date/time inputs are
            interpreted in that timezone before saving.
          </p>

          <div>
            <Label htmlFor="activity-type" required>
              Type
            </Label>
            <Select
              id="activity-type"
              value={form.typeId}
              onChange={(event) => setForm((current) => ({ ...current, typeId: event.target.value }))}
              required
            >
              <option value="">Select type</option>
              {types.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="activity-status" required>
              Status
            </Label>
            <Select
              id="activity-status"
              value={form.statusId}
              onChange={(event) =>
                setForm((current) => ({ ...current, statusId: event.target.value }))
              }
              required
            >
              <option value="">Select status</option>
              {statuses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="activity-title" required>
              Title
            </Label>
            <Input
              id="activity-title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              required
            />
          </div>

          <div>
            <Label htmlFor="activity-description">Description</Label>
            <Textarea
              id="activity-description"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="activity-due">Due date</Label>
            <Input
              id="activity-due"
              type="datetime-local"
              value={form.dueDate}
              onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="activity-next">Next action date</Label>
            <Input
              id="activity-next"
              type="datetime-local"
              value={form.nextActionDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, nextActionDate: event.target.value }))
              }
            />
          </div>

          <div>
            <Label htmlFor="activity-assigned">Assigned to</Label>
            <MemberSelector
              members={members}
              selectedUserId={form.assignedTo || null}
              onChange={(userId) =>
                setForm((current) => ({ ...current, assignedTo: userId ?? "" }))
              }
              placeholder="Select assignee"
            />
          </div>

          {isEdit && (
            <div>
              <Label htmlFor="activity-outcome">Outcome</Label>
              <Textarea
                id="activity-outcome"
                value={form.outcome}
                onChange={(event) =>
                  setForm((current) => ({ ...current, outcome: event.target.value }))
                }
                rows={2}
              />
            </div>
          )}

          {error && (
            <p className="text-[12px] text-[var(--color-danger-fg)]">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || loading || (!isEdit && !hasLinkContext)}
            >
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Create activity"}
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
