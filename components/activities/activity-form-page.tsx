"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { MemberSelector, type MemberSelectorMember } from "@/components/domain/member-selector";
import {
  ProjectSelector,
  type ProjectSelectorProject,
} from "@/components/domain/project-selector";
import {
  FocusedFormActions,
  FocusedFormLayout,
} from "@/components/layout/focused-form-layout";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  fromDatetimeLocalInWorkspaceTimezone,
  toDatetimeLocalInWorkspaceTimezone,
} from "@/lib/workspace-datetime";
import { workspacePath } from "@/lib/workspace-paths";

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

export type ActivityFormInitialValues = {
  projectId?: string;
  typeId: string;
  statusId: string;
  title: string;
  description: string;
  dueDate: string;
  nextActionDate: string;
  assignedTo: string;
  outcome: string;
};

type ActivityFormPageProps = {
  workspaceSlug: string;
  workspaceTimezone: string;
  mode: "create" | "edit";
  activityId?: string;
  context?: ActivityFormContext;
  initialValues?: ActivityFormInitialValues;
  cancelHref: string;
  back?: { href: string; label?: string };
};

const emptyForm: ActivityFormInitialValues = {
  projectId: "",
  typeId: "",
  statusId: "",
  title: "",
  description: "",
  dueDate: "",
  nextActionDate: "",
  assignedTo: "",
  outcome: "",
};

export function ActivityFormPage({
  workspaceSlug,
  workspaceTimezone,
  mode,
  activityId,
  context,
  initialValues,
  cancelHref,
  back,
}: ActivityFormPageProps) {
  const router = useRouter();
  const [types, setTypes] = useState<DictionaryItem[]>([]);
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [members, setMembers] = useState<MemberSelectorMember[]>([]);
  const [projects, setProjects] = useState<ProjectSelectorProject[]>([]);
  const [form, setForm] = useState<ActivityFormInitialValues>(initialValues ?? emptyForm);
  const [loading, setLoading] = useState(mode === "edit" && !initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const formId = mode === "create" ? "create-activity-form" : "edit-activity-form";
  const isEdit = mode === "edit";
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
    async function loadOptions() {
      setError(null);

      try {
        const [typesRes, statusesRes, membersRes, projectsRes] = await Promise.all([
          fetch(`${apiBase}/dictionary-items?type=activity_type`),
          fetch(`${apiBase}/dictionary-items?type=activity_status`),
          fetch(`${apiBase}/members`),
          fetch(`${apiBase}/projects`),
        ]);

        const [typesPayload, statusesPayload, membersPayload, projectsPayload] =
          await Promise.all([
          typesRes.json(),
          statusesRes.json(),
          membersRes.json(),
          projectsRes.json(),
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
        if (projectsRes.ok) {
          setProjects(projectsPayload.data.projects as ProjectSelectorProject[]);
        }
      } catch {
        setError("Failed to load form options.");
      }
    }

    void loadOptions();
  }, [apiBase]);

  useEffect(() => {
    if (initialValues) {
      setForm(initialValues);
      setLoading(false);
    }
  }, [initialValues]);

  useEffect(() => {
    if (isEdit || initialValues) {
      return;
    }

    // Only fill empty type/status defaults. Replacing the whole form with
    // emptyForm would wipe dueDate/nextActionDate entered before options load.
    setForm((current) => {
      const typeId = current.typeId || defaultTypeId;
      const statusId = current.statusId || defaultStatusId;
      if (typeId === current.typeId && statusId === current.statusId) {
        return current;
      }
      return { ...current, typeId, statusId };
    });
  }, [defaultStatusId, defaultTypeId, initialValues, isEdit]);

  useEffect(() => {
    if (isEdit || hasLinkContext || form.projectId || projects.length === 0) {
      return;
    }

    if (projects.length === 1) {
      setForm((current) => ({ ...current, projectId: projects[0].id }));
    }
  }, [form.projectId, hasLinkContext, isEdit, projects]);

  useEffect(() => {
    if (!isEdit || !activityId || initialValues) {
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
          projectId: "",
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
  }, [activityId, apiBase, initialValues, isEdit, workspaceTimezone]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Prefer live DOM values: datetime-local can show a committed picker value
      // before React state catches up (especially with footer submit).
      const formData = new FormData(event.currentTarget);
      const dueDateLocal = String(formData.get("dueDate") ?? "").trim();
      const nextActionDateLocal = String(formData.get("nextActionDate") ?? "").trim();

      const dueDateIso = fromDatetimeLocalInWorkspaceTimezone(
        dueDateLocal,
        workspaceTimezone,
      );
      const nextActionDateIso = fromDatetimeLocalInWorkspaceTimezone(
        nextActionDateLocal,
        workspaceTimezone,
      );

      const payload: Record<string, unknown> = {
        typeId: form.typeId,
        statusId: form.statusId,
        title: form.title,
        description: form.description.trim() || undefined,
        assignedTo: form.assignedTo || undefined,
        outcome: form.outcome.trim() || undefined,
      };

      if (dueDateIso) {
        payload.dueDate = dueDateIso;
      } else if (isEdit) {
        payload.dueDate = null;
      }

      if (nextActionDateIso) {
        payload.nextActionDate = nextActionDateIso;
      } else if (isEdit) {
        payload.nextActionDate = null;
      }

      if (!isEdit) {
        if (context?.opportunityId) {
          payload.opportunityId = context.opportunityId;
        } else if (context?.leadId) {
          payload.leadId = context.leadId;
        } else if (context?.propertyId) {
          payload.propertyId = context.propertyId;
        } else if (form.projectId) {
          payload.projectId = form.projectId;
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

      const savedActivityId = isEdit ? activityId : body.data?.activity?.id;
      if (context?.leadId) {
        router.push(workspacePath(workspaceSlug, "leads", context.leadId));
      } else if (context?.propertyId) {
        router.push(workspacePath(workspaceSlug, "properties", context.propertyId));
      } else if (context?.opportunityId) {
        router.push(workspacePath(workspaceSlug, "opportunities", context.opportunityId));
      } else if (savedActivityId) {
        router.push(workspacePath(workspaceSlug, "activities"));
      } else {
        router.push(workspacePath(workspaceSlug, "activities"));
      }
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <FocusedFormLayout title={isEdit ? "Edit activity" : "New activity"} back={back}>
        <p className="text-[13px] text-[var(--color-ink-muted)]">Loading…</p>
      </FocusedFormLayout>
    );
  }

  return (
    <FocusedFormLayout
      title={isEdit ? "Edit activity" : "New activity"}
      description={
        isEdit
          ? "Update activity details, schedule, and assignment."
          : "Schedule a follow-up linked to a lead, property, or opportunity."
      }
      back={back}
    >
      <form id={formId} className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        {!isEdit && !hasLinkContext && (
          <>
            {projects.length === 0 ? (
              <p className="text-[12px] text-[var(--color-ink-muted)] rounded-lg border border-dashed border-[var(--color-line-strong)] px-3 py-2">
                Create an active project before scheduling a standalone activity.
              </p>
            ) : (
              <div>
                <Label htmlFor="activity-project" required>
                  Project
                </Label>
                <ProjectSelector
                  projects={projects}
                  selectedProjectId={form.projectId || null}
                  onChange={(projectId) =>
                    setForm((current) => ({ ...current, projectId: projectId ?? "" }))
                  }
                  emptyLabel="No active projects available"
                />
              </div>
            )}
          </>
        )}

        {!isEdit && hasLinkContext && (
          <p className="text-[12px] text-[var(--color-ink-muted)] rounded-lg border border-dashed border-[var(--color-line-strong)] px-3 py-2">
            This activity will inherit project scope from the linked record.
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
            key={`due-${isEdit ? activityId : "new"}-${form.dueDate || "empty"}`}
            name="dueDate"
            type="datetime-local"
            defaultValue={form.dueDate}
          />
        </div>

        <div>
          <Label htmlFor="activity-next">Next action date</Label>
          <Input
            id="activity-next"
            key={`next-${isEdit ? activityId : "new"}-${form.nextActionDate || "empty"}`}
            name="nextActionDate"
            type="datetime-local"
            defaultValue={form.nextActionDate}
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

        {error && <p className="text-[12px] text-[var(--color-danger-fg)]">{error}</p>}

        <FocusedFormActions
          cancelHref={cancelHref}
          formId={formId}
          submitLabel={isEdit ? "Save changes" : "Create activity"}
          submitting={submitting}
          submitDisabled={!isEdit && !hasLinkContext}
        />
      </form>
    </FocusedFormLayout>
  );
}
