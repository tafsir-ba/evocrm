/** Idempotent Lead.notes mirroring for published Notes sessions. */

export function notesSessionMirrorMarker(sessionId: string): string {
  return `[Note session:${sessionId}]`;
}

/**
 * Upsert a session-scoped note block onto Lead.notes.
 * Republish replaces the same session block instead of appending duplicates.
 */
export function upsertLeadNotesMirror(input: {
  existingNotes: string | null | undefined;
  sessionId: string;
  body: string;
  maxLength?: number;
}): string {
  const maxLength = input.maxLength ?? 5000;
  const marker = notesSessionMirrorMarker(input.sessionId);
  const body = input.body.trim();
  const block = `${marker}\n${body}`;
  const existing = input.existingNotes?.trim() ?? "";

  if (!existing) {
    return block.slice(0, maxLength);
  }

  if (existing.includes(marker)) {
    const escaped = sessionIdEscape(input.sessionId);
    const pattern = new RegExp(
      `\\[Note session:${escaped}\\][\\s\\S]*?(?=\\n\\n\\[Note |$)`,
    );
    return existing.replace(pattern, block).slice(0, maxLength);
  }

  return `${existing}\n\n${block}`.slice(0, maxLength);
}

function sessionIdEscape(sessionId: string): string {
  return sessionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
