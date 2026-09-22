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

  return [
    `Summary\n${draft.summary || "—"}`,
    `Customer requirements\n${draft.customerRequirements || "—"}`,
    `Property / project discussed\n${draft.propertyDiscussed || "—"}`,
    `Questions / objections\n${draft.questionsObjections || "—"}`,
    `Actions\n${draft.actions || "—"}`,
    `Next steps\n${nextSteps || "—"}`,
    `Needs confirmation\n${confirmation || "—"}`,
  ].join("\n\n");
}
