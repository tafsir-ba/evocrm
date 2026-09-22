const DRAFT_PREFIX = "evocrm.visit-notes.draft.";
const QUEUE_PREFIX = "evocrm.visit-notes.queue.";

export type OfflineVisitDraft = {
  sessionId: string | null;
  leadId: string | null;
  text: string;
  updatedAt: string;
};

export type QueuedVisitUpload = {
  id: string;
  sessionId: string;
  fileName: string;
  mimeType: string;
  /** base64 payload for small offline retries; large files stay in-memory only */
  base64?: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

function storageKey(prefix: string, workspaceSlug: string, key: string): string {
  return `${prefix}${workspaceSlug}.${key}`;
}

export function loadOfflineDraft(
  workspaceSlug: string,
  key: string,
): OfflineVisitDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(DRAFT_PREFIX, workspaceSlug, key));
    if (!raw) return null;
    return JSON.parse(raw) as OfflineVisitDraft;
  } catch {
    return null;
  }
}

export function saveOfflineDraft(
  workspaceSlug: string,
  key: string,
  draft: OfflineVisitDraft,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(DRAFT_PREFIX, workspaceSlug, key),
      JSON.stringify(draft),
    );
  } catch {
    // Quota / private mode — ignore; in-memory state remains.
  }
}

export function clearOfflineDraft(workspaceSlug: string, key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(DRAFT_PREFIX, workspaceSlug, key));
}

export function loadUploadQueue(workspaceSlug: string): QueuedVisitUpload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(QUEUE_PREFIX, workspaceSlug, "uploads"));
    if (!raw) return [];
    return JSON.parse(raw) as QueuedVisitUpload[];
  } catch {
    return [];
  }
}

export function saveUploadQueue(
  workspaceSlug: string,
  queue: QueuedVisitUpload[],
): void {
  if (typeof window === "undefined") return;
  try {
    // Persist metadata only (no large base64) to avoid quota blowouts.
    const slim = queue.map(({ base64: _base64, ...rest }) => rest);
    window.localStorage.setItem(
      storageKey(QUEUE_PREFIX, workspaceSlug, "uploads"),
      JSON.stringify(slim),
    );
  } catch {
    // ignore
  }
}
