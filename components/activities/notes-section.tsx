"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { formatActivityDateTime } from "@/components/activities/activity-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { IconNote } from "@/lib/icons";

type DictionaryItem = {
  id: string;
  key: string;
  label: string;
  behavior?: string;
};

type NoteItem = {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  completedAt: string | null;
  nextActionDate: string | null;
  dueDate: string | null;
  hubspotExternalActivityId?: string | null;
  createdByUser?: { id: string; name: string | null; email: string } | null;
  assignedUser?: { id: string; name: string | null; email: string } | null;
  type?: { key: string } | null;
};

type NotesSectionProps = {
  workspaceSlug: string;
  workspaceTimezone: string;
  leadId: string;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
};

function noteTitleFromBody(body: string): string {
  const firstLine = body.trim().split(/\n/)[0]?.trim() || "Note";
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

function authorLabel(note: NoteItem): string {
  return note.createdByUser?.name || note.createdByUser?.email || note.assignedUser?.name || "Internal";
}

function isHubSpotNote(note: NoteItem): boolean {
  return Boolean(note.hubspotExternalActivityId);
}

export function NotesSection({
  workspaceSlug,
  workspaceTimezone,
  leadId,
  canRead,
  canCreate,
  canUpdate,
  canArchive,
}: NotesSectionProps) {
  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [noteTypeId, setNoteTypeId] = useState<string | null>(null);
  const [taskTypeId, setTaskTypeId] = useState<string | null>(null);
  const [completedStatusId, setCompletedStatusId] = useState<string | null>(null);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [actionPending, setActionPending] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [typesResponse, statusesResponse] = await Promise.all([
        fetch(`${apiBase}/dictionary-items?type=activity_type`),
        fetch(`${apiBase}/dictionary-items?type=activity_status`),
      ]);

      if (!typesResponse.ok || !statusesResponse.ok) {
        throw new Error("Failed to load note types.");
      }

      const typesPayload = (await typesResponse.json()) as { data?: { items?: DictionaryItem[] } };
      const statusesPayload = (await statusesResponse.json()) as {
        data?: { items?: DictionaryItem[] };
      };
      const types = typesPayload.data?.items ?? [];
      const statuses = statusesPayload.data?.items ?? [];
      const nextNoteTypeId = types.find((item) => item.key === "note")?.id ?? null;
      const nextTaskTypeId = types.find((item) => item.key === "task")?.id ?? null;
      const nextCompletedStatusId =
        statuses.find((item) => item.behavior === "completed" || item.key === "completed")?.id ??
        null;
      const nextPendingStatusId =
        statuses.find((item) => item.behavior === "pending" || item.key === "pending")?.id ?? null;

      setNoteTypeId(nextNoteTypeId);
      setTaskTypeId(nextTaskTypeId);
      setCompletedStatusId(nextCompletedStatusId);
      setPendingStatusId(nextPendingStatusId);

      if (!nextNoteTypeId) {
        setNotes([]);
        return;
      }

      const params = new URLSearchParams({
        leadId,
        typeId: nextNoteTypeId,
        pageSize: "50",
      });
      const notesResponse = await fetch(`${apiBase}/activities?${params.toString()}`);
      if (notesResponse.status === 403) {
        setNotes([]);
        return;
      }
      if (!notesResponse.ok) {
        throw new Error("Failed to load notes.");
      }
      const notesPayload = (await notesResponse.json()) as { data?: NoteItem[] };
      const nextNotes = [...(notesPayload.data ?? [])].sort((left, right) => {
        const leftAt = new Date(left.completedAt ?? left.createdAt).getTime();
        const rightAt = new Date(right.completedAt ?? right.createdAt).getTime();
        return rightAt - leftAt;
      });
      setNotes(nextNotes);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load notes.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, canRead, leadId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const canCompose = canCreate && Boolean(noteTypeId && completedStatusId);

  const followUpLabel = useMemo(() => {
    if (!followUpAt) return null;
    return formatActivityDateTime(new Date(followUpAt).toISOString(), workspaceTimezone);
  }, [followUpAt, workspaceTimezone]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || !canCompose || !noteTypeId || !completedStatusId) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const title = noteTitleFromBody(trimmed);
      const followUpIso = followUpAt ? new Date(followUpAt).toISOString() : null;
      const noteResponse = await fetch(`${apiBase}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          typeId: noteTypeId,
          statusId: completedStatusId,
          title,
          description: trimmed,
          nextActionDate: followUpIso ?? undefined,
        }),
      });
      if (!noteResponse.ok) {
        const payload = await noteResponse.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Could not save the note.");
      }

      if (followUpIso && taskTypeId && pendingStatusId) {
        const taskResponse = await fetch(`${apiBase}/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId,
            typeId: taskTypeId,
            statusId: pendingStatusId,
            title: `Follow-up: ${title}`,
            description: trimmed,
            dueDate: followUpIso,
          }),
        });
        if (!taskResponse.ok) {
          const payload = await taskResponse.json().catch(() => null);
          throw new Error(payload?.error?.message ?? "Note saved, but the follow-up task failed.");
        }
      }

      setBody("");
      setFollowUpAt("");
      await loadNotes();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the note.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(note: NoteItem) {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    setActionPending(note.id);
    try {
      const response = await fetch(`${apiBase}/activities/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: noteTitleFromBody(trimmed),
          description: trimmed,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Could not update the note.");
      }
      setEditingId(null);
      await loadNotes();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update the note.");
    } finally {
      setActionPending(null);
    }
  }

  async function handleArchive(note: NoteItem) {
    if (!window.confirm("Archive this note?")) {
      return;
    }
    setActionPending(note.id);
    try {
      const response = await fetch(`${apiBase}/activities/${note.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Could not archive the note.");
      }
      await loadNotes();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Could not archive the note.");
    } finally {
      setActionPending(null);
    }
  }

  if (!canRead) {
    return (
      <div className="px-5 pb-5">
        <EmptyState
          title="Notes unavailable"
          description="You do not have permission to view notes."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3 px-5 pb-5">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="px-5 pb-5">
      {canCompose ? (
        <form onSubmit={(event) => void handleCreate(event)} className="mb-5 space-y-3">
          <Label htmlFor="lead-note-body">Internal note</Label>
          <Textarea
            id="lead-note-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write an internal note…"
            rows={4}
          />
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px]">
              <Label htmlFor="lead-note-follow-up">Follow up</Label>
              <Input
                id="lead-note-follow-up"
                type="datetime-local"
                fieldSize="sm"
                className="mt-1"
                value={followUpAt}
                onChange={(event) => setFollowUpAt(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={!body.trim() || saving}>
              {saving ? "Saving…" : followUpAt ? "Save note + follow-up" : "Save note"}
            </Button>
          </div>
          {followUpLabel ? (
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Creates a pending follow-up task for {followUpLabel}.
            </p>
          ) : (
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Notes are timestamped. Add a follow-up time to put a task on Activities and Next.
            </p>
          )}
        </form>
      ) : null}

      {error ? (
        <div className="mb-4">
          <ErrorState
            title="Notes"
            description={error}
            primaryAction={{ label: "Retry", onClick: () => void loadNotes() }}
          />
        </div>
      ) : null}

      {notes.length === 0 && !error ? (
        <EmptyState
          title="No notes yet"
          description="Add an internal note to keep a timestamped record on this lead."
        />
      ) : (
        <ol className="space-y-3">
          {notes.map((note) => {
            const stamped = formatActivityDateTime(
              note.completedAt ?? note.createdAt,
              workspaceTimezone,
            );
            const followUp = note.nextActionDate
              ? formatActivityDateTime(note.nextActionDate, workspaceTimezone)
              : null;
            const editing = editingId === note.id;

            return (
              <li
                key={note.id}
                className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex text-[var(--color-ink-muted)]">
                    <IconNote size={14} />
                  </span>
                  <p className="text-[12.5px] text-[var(--color-ink-muted)]">
                    <span className="font-medium text-[var(--color-ink-soft)]">
                      {authorLabel(note)}
                    </span>
                    {" · "}
                    <span className="tabular">{stamped}</span>
                  </p>
                  {isHubSpotNote(note) ? (
                    <Badge tone="muted" size="sm">
                      HubSpot
                    </Badge>
                  ) : (
                    <Badge tone="muted" size="sm">
                      Internal
                    </Badge>
                  )}
                  {followUp ? (
                    <Badge tone="info" size="sm">
                      Follow-up {followUp}
                    </Badge>
                  ) : null}
                </div>

                {editing ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editBody}
                      onChange={(event) => setEditBody(event.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!editBody.trim() || actionPending === note.id}
                        onClick={() => void handleSaveEdit(note)}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-[13.5px] text-[var(--color-ink)]">
                    {note.description || note.title}
                  </p>
                )}

                {!editing && (canUpdate || canArchive) ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canUpdate ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={actionPending === note.id}
                        onClick={() => {
                          setEditingId(note.id);
                          setEditBody(note.description || note.title);
                        }}
                      >
                        Edit
                      </Button>
                    ) : null}
                    {canArchive ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={actionPending === note.id}
                        onClick={() => void handleArchive(note)}
                      >
                        Archive
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
