import {
  resolveVisitMediaMimeType,
  validateVisitMediaFileClient,
  visitMediaKindFromMime,
} from "@/lib/visit-notes";

export type VisitMediaUploadStage =
  | "validate"
  | "presign"
  | "storage_put"
  | "confirm"
  | "attach"
  | "transcribe";

export class VisitMediaUploadError extends Error {
  readonly stage: VisitMediaUploadStage;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      stage: VisitMediaUploadStage;
      status?: number;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "VisitMediaUploadError";
    this.stage = options.stage;
    this.status = options.status;
    this.retryable = options.retryable ?? true;
  }
}

export type VisitMediaUploadResult = {
  documentId: string;
  kind: "photo" | "audio" | "video";
  fileName: string;
  mimeType: string;
  fileSize: number;
};

function readApiErrorMessage(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof (body.error as { message: unknown }).message === "string"
  ) {
    return (body.error as { message: string }).message;
  }
  return fallback;
}

export function describeStoragePutFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  // Safari/WebKit surfaces CORS / blocked cross-origin PUT as "Load failed".
  if (
    normalized === "load failed" ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network request failed")
  ) {
    return (
      "Storage upload blocked (often Spaces CORS or network). " +
      "Ask an admin to allow PUT + Content-Type from this CRM origin on the Spaces bucket, then Retry."
    );
  }

  if (message.trim()) return message;
  return "Direct storage upload failed. Retry when online.";
}

/**
 * Ensure File has a usable MIME for validation + Spaces Content-Type signing.
 * iPhone Safari often provides an empty type.
 */
export function coerceVisitMediaFile(file: File): File {
  const mimeType = resolveVisitMediaMimeType(file);
  if (mimeType && mimeType === file.type) return file;
  return new File([file], file.name, {
    type: mimeType || "application/octet-stream",
    lastModified: file.lastModified,
  });
}

function postVisitMediaFormData(input: {
  url: string;
  formData: FormData;
  onProgress?: (percent: number) => void;
}): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", input.url);
    xhr.responseType = "json";
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !input.onProgress) return;
      const percent = Math.max(
        0,
        Math.min(99, Math.round((event.loaded / event.total) * 100)),
      );
      input.onProgress(percent);
    };

    xhr.onload = () => {
      const body =
        xhr.response ??
        (() => {
          try {
            return JSON.parse(xhr.responseText) as unknown;
          } catch {
            return null;
          }
        })();
      resolve({ status: xhr.status, body });
    };

    xhr.onerror = () => {
      reject(new Error("Network request failed"));
    };

    xhr.ontimeout = () => {
      reject(new Error("Upload timed out. Retry when the connection is stable."));
    };

    xhr.timeout = 120_000;
    xhr.send(input.formData);
  });
}

/**
 * Upload visit media via same-origin CRM API (server puts to Spaces).
 * Avoids browser → Spaces CORS failures that iPhone Safari reports as "Load failed".
 */
export async function uploadVisitMedia(input: {
  workspaceSlug: string;
  sessionId: string;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<VisitMediaUploadResult> {
  const file = coerceVisitMediaFile(input.file);
  const validationError = validateVisitMediaFileClient(file);
  if (validationError) {
    throw new VisitMediaUploadError(validationError, {
      stage: "validate",
      retryable: false,
    });
  }

  const mimeType = resolveVisitMediaMimeType(file);
  const kind = visitMediaKindFromMime(mimeType);
  if (!kind) {
    throw new VisitMediaUploadError("Unsupported media type.", {
      stage: "validate",
      retryable: false,
    });
  }

  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("linkedEntityType", "visit_session");
  formData.append("linkedEntityId", input.sessionId);
  formData.append("mimeType", mimeType);
  formData.append("visibility", "private");

  input.onProgress?.(5);

  let response: { status: number; body: unknown };
  try {
    response = await postVisitMediaFormData({
      url: `/api/workspaces/${input.workspaceSlug}/documents/direct`,
      formData,
      onProgress: input.onProgress,
    });
  } catch (error) {
    throw new VisitMediaUploadError(
      "Could not reach CRM to upload media. Check connection and Retry.",
      { stage: "storage_put", cause: error },
    );
  }

  if (response.status < 200 || response.status >= 300) {
    throw new VisitMediaUploadError(
      readApiErrorMessage(response.body, "Failed to upload media."),
      {
        stage: response.status >= 500 ? "storage_put" : "presign",
        status: response.status,
        retryable: response.status >= 500 || response.status === 429,
      },
    );
  }

  const documentId = (
    response.body as { data?: { document?: { id?: string } } } | null
  )?.data?.document?.id;

  if (!documentId) {
    throw new VisitMediaUploadError(
      "Upload response was incomplete. Retry to finish attaching.",
      { stage: "confirm", status: response.status },
    );
  }

  input.onProgress?.(100);

  return {
    documentId,
    kind,
    fileName: file.name,
    mimeType,
    fileSize: file.size,
  };
}

export async function fetchDocumentSignedUrl(
  workspaceSlug: string,
  documentId: string,
): Promise<string> {
  const response = await fetch(
    `/api/workspaces/${workspaceSlug}/documents/${documentId}/signed-url`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      readApiErrorMessage(body, "Could not open media (signed URL failed)."),
    );
  }
  const body = (await response.json()) as {
    data: { url: string };
  };
  return body.data.url;
}
