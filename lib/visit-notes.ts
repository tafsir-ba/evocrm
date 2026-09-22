/** Visit Notes media + session constants (client-safe). Keep in sync with server validation. */

export const VISIT_SESSION_STATUSES = [
  "open",
  "draft",
  "published",
  "amended",
  "archived",
] as const;

export type VisitSessionStatus = (typeof VISIT_SESSION_STATUSES)[number];

export const VISIT_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/x-m4a",
  "audio/mp3",
  "audio/aac",
] as const;

/** Includes iPhone Camera Roll QuickTime (.mov). */
export const VISIT_VIDEO_MIME_TYPES = [
  "video/webm",
  "video/mp4",
  "video/quicktime",
] as const;

/** Includes iPhone HEIC/HEIF from Photos. */
export const VISIT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const VISIT_MEDIA_MIME_TYPES = [
  ...VISIT_IMAGE_MIME_TYPES,
  ...VISIT_AUDIO_MIME_TYPES,
  ...VISIT_VIDEO_MIME_TYPES,
] as const;

/** Visit session media max size — 50 MB (larger than general document 25 MB). */
export const MAX_VISIT_MEDIA_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Client guidance only — server enforces size, not duration. */
export const VISIT_AUDIO_MAX_DURATION_SECONDS = 15 * 60;
export const VISIT_VIDEO_MAX_DURATION_SECONDS = 3 * 60;

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  webm: "video/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  aac: "audio/aac",
};

export function extensionOfFileName(fileName: string): string {
  const base = fileName.trim().split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Safari/iOS often yields empty File.type — infer from extension. */
export function resolveVisitMediaMimeType(file: {
  name: string;
  type: string;
}): string {
  const declared = file.type.trim().toLowerCase();
  if (declared && declared !== "application/octet-stream") {
    return declared;
  }
  const ext = extensionOfFileName(file.name);
  return EXT_MIME[ext] ?? declared;
}

export function isVisitAudioMimeType(mimeType: string): boolean {
  return (VISIT_AUDIO_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isVisitVideoMimeType(mimeType: string): boolean {
  return (VISIT_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isVisitImageMimeType(mimeType: string): boolean {
  return (VISIT_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isVisitMediaMimeType(mimeType: string): boolean {
  return (VISIT_MEDIA_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function visitMediaKindFromMime(
  mimeType: string,
): "photo" | "audio" | "video" | null {
  if (isVisitImageMimeType(mimeType)) return "photo";
  if (isVisitAudioMimeType(mimeType)) return "audio";
  if (isVisitVideoMimeType(mimeType)) return "video";
  return null;
}

export function formatVisitMediaFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Human title from first substantive user text (ChatGPT-style). */
export function deriveVisitSessionTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= 60) return cleaned;
  return `${cleaned.slice(0, 57).trimEnd()}…`;
}

export function formatVisitSessionFallbackTitle(createdAt: Date | string): string {
  const date =
    createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "New note";
  return `Note · ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export function validateVisitMediaFileClient(file: File): string | null {
  if (file.size <= 0) return "File cannot be empty.";
  if (file.size > MAX_VISIT_MEDIA_FILE_SIZE_BYTES) {
    return `File exceeds maximum size of ${formatVisitMediaFileSize(MAX_VISIT_MEDIA_FILE_SIZE_BYTES)}.`;
  }
  const mimeType = resolveVisitMediaMimeType(file);
  if (!isVisitMediaMimeType(mimeType)) {
    return `Unsupported media type (${mimeType || "unknown"}). Use JPEG/PNG/WebP/HEIC photo, WebM/MP4/MOV video, or WebM/MP4/M4A audio.`;
  }
  return null;
}

export function pickSupportedAudioRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/mp4",
    "audio/aac",
    "audio/webm;codecs=opus",
    "audio/webm",
  ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate.split(";")[0] ?? candidate;
    }
  }
  return null;
}

export type VisitDraftNextStep = {
  text: string;
  ownerName: string | null;
  dueDate: Date | string | null;
  needsConfirmation: boolean;
};

export type VisitDraftBodySource = {
  summary: string;
  customerRequirements: string;
  propertyDiscussed: string;
  questionsObjections: string;
  actions: string;
  nextSteps: VisitDraftNextStep[];
  needsConfirmation: string[];
  editedBody?: string | null;
  version?: number;
  language?: string;
  sourceMessageIds?: string[];
  createdAt?: Date;
};

export function formatVisitDraftBody(draft: VisitDraftBodySource): string {
  if (draft.editedBody?.trim()) {
    return draft.editedBody.trim();
  }

  const nextSteps = draft.nextSteps
    .map((step) => {
      const bits = [step.text];
      if (step.ownerName) bits.push(`owner: ${step.ownerName}`);
      if (step.dueDate) {
        const due =
          step.dueDate instanceof Date
            ? step.dueDate.toISOString().slice(0, 10)
            : String(step.dueDate).slice(0, 10);
        bits.push(`due: ${due}`);
      }
      if (step.needsConfirmation) bits.push("needs confirmation");
      return `- ${bits.join(" · ")}`;
    })
    .join("\n");

  const confirmation = draft.needsConfirmation.map((item) => `- ${item}`).join("\n");

  // Omit empty sections — blank "Next steps —" implies invented follow-up.
  const sections: string[] = [];
  if (draft.summary.trim()) sections.push(`Summary\n${draft.summary.trim()}`);
  if (draft.customerRequirements.trim()) {
    sections.push(`Customer requirements\n${draft.customerRequirements.trim()}`);
  }
  if (draft.propertyDiscussed.trim()) {
    sections.push(`Property / project discussed\n${draft.propertyDiscussed.trim()}`);
  }
  if (draft.questionsObjections.trim()) {
    sections.push(`Questions / objections\n${draft.questionsObjections.trim()}`);
  }
  if (draft.actions.trim()) sections.push(`Actions\n${draft.actions.trim()}`);
  if (nextSteps) sections.push(`Next steps\n${nextSteps}`);
  if (confirmation) sections.push(`Needs confirmation\n${confirmation}`);

  return sections.join("\n\n");
}

/** Ready user content (not system/legacy transcript-only rows). */
export function visitSessionHasSubstantiveContent(session: {
  messages: Array<{ kind: string; text?: string | null; status?: string }>;
  title?: string | null;
  draftBody?: string | null;
  aiDraft?: unknown | null;
  status: string;
}): boolean {
  if (session.aiDraft) return true;
  if (session.draftBody?.trim()) return true;
  if (session.title?.trim()) return true;
  if (session.status === "published" || session.status === "amended") return true;
  return session.messages.some((message) => {
    if (message.kind === "system" || message.kind === "transcript") return false;
    if (message.status && message.status !== "ready" && message.status !== "failed") {
      // In-flight media still counts as substantive capture.
      return message.kind === "photo" || message.kind === "video" || message.kind === "audio";
    }
    return (
      message.kind === "text" ||
      message.kind === "photo" ||
      message.kind === "video" ||
      message.kind === "audio"
    );
  });
}

/**
 * Prefer last-opened, then latest substantive session.
 * Do not let empty open sessions win via updatedAt touch/backfill.
 */
export function pickResumeVisitSession<
  T extends {
    id: string;
    status: string;
    createdAt: string;
    updatedAt?: string;
    messages: Array<{ kind: string; text?: string | null; status?: string }>;
    title?: string | null;
    draftBody?: string | null;
    aiDraft?: unknown | null;
  },
>(sessions: T[], options?: { lastOpenedId?: string | null }): T | null {
  if (sessions.length === 0) return null;

  const lastOpenedId = options?.lastOpenedId?.trim() || null;
  if (lastOpenedId) {
    const remembered = sessions.find(
      (item) => item.id === lastOpenedId && item.status !== "archived",
    );
    if (remembered) return remembered;
  }

  const byCreatedDesc = [...sessions].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

  const substantive = byCreatedDesc.find((item) =>
    visitSessionHasSubstantiveContent(item),
  );
  if (substantive) return substantive;

  return (
    byCreatedDesc.find(
      (item) => item.status === "open" || item.status === "draft",
    ) ?? null
  );
}
