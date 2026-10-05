export type LeadNoteDictionaryItem = {
  id: string;
  key: string;
  behavior?: string;
};

export type LeadNoteActivityIds = {
  noteTypeId: string | null;
  taskTypeId: string | null;
  completedStatusId: string | null;
  pendingStatusId: string | null;
};

export function noteTitleFromBody(body: string): string {
  const firstLine = body.trim().split(/\n/)[0]?.trim() || "Note";
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

export function resolveLeadNoteActivityIds(
  activityTypes: LeadNoteDictionaryItem[],
  activityStatuses: LeadNoteDictionaryItem[],
): LeadNoteActivityIds {
  return {
    noteTypeId: activityTypes.find((item) => item.key === "note")?.id ?? null,
    taskTypeId: activityTypes.find((item) => item.key === "task")?.id ?? null,
    completedStatusId:
      activityStatuses.find((item) => item.behavior === "completed" || item.key === "completed")
        ?.id ?? null,
    pendingStatusId:
      activityStatuses.find((item) => item.behavior === "pending" || item.key === "pending")?.id ??
      null,
  };
}

export function canCreateLeadNote(ids: LeadNoteActivityIds): boolean {
  return Boolean(ids.noteTypeId && ids.completedStatusId);
}

/**
 * Creates a completed "note" activity on the lead (shown in the lead's Notes tab) and, when a
 * follow-up time is given, a pending follow-up task that feeds the leads table "Next" column.
 */
export async function createLeadNote({
  apiBase,
  leadId,
  body,
  followUpIso,
  ids,
}: {
  apiBase: string;
  leadId: string;
  body: string;
  followUpIso?: string | null;
  ids: LeadNoteActivityIds;
}): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed || !ids.noteTypeId || !ids.completedStatusId) {
    throw new Error("Notes are not available in this workspace.");
  }

  const title = noteTitleFromBody(trimmed);
  const noteResponse = await fetch(`${apiBase}/activities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leadId,
      typeId: ids.noteTypeId,
      statusId: ids.completedStatusId,
      title,
      description: trimmed,
      nextActionDate: followUpIso ?? undefined,
    }),
  });
  if (!noteResponse.ok) {
    const payload = await noteResponse.json().catch(() => null);
    throw new Error(payload?.error?.message ?? "Could not save the note.");
  }

  if (followUpIso && ids.taskTypeId && ids.pendingStatusId) {
    const taskResponse = await fetch(`${apiBase}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId,
        typeId: ids.taskTypeId,
        statusId: ids.pendingStatusId,
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
}
