import {
  validateVisitMediaFileClient,
  visitMediaKindFromMime,
} from "@/lib/visit-notes";

export type VisitMediaUploadResult = {
  documentId: string;
  kind: "photo" | "audio" | "video";
  fileName: string;
  mimeType: string;
};

export async function uploadVisitMedia(input: {
  workspaceSlug: string;
  sessionId: string;
  file: File;
}): Promise<VisitMediaUploadResult> {
  const validationError = validateVisitMediaFileClient(input.file);
  if (validationError) {
    throw new Error(validationError);
  }

  const kind = visitMediaKindFromMime(input.file.type);
  if (!kind) {
    throw new Error("Unsupported media type.");
  }

  const apiBase = `/api/workspaces/${input.workspaceSlug}/documents`;

  const uploadUrlResponse = await fetch(`${apiBase}/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      linkedEntityType: "visit_session",
      linkedEntityId: input.sessionId,
      fileName: input.file.name,
      mimeType: input.file.type,
      fileSize: input.file.size,
      visibility: "private",
    }),
  });

  if (!uploadUrlResponse.ok) {
    const body = await uploadUrlResponse.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Failed to start upload.");
  }

  const uploadUrlBody = (await uploadUrlResponse.json()) as {
    data: {
      upload: {
        uploadId: string;
        uploadUrl: string;
        storageKey: string;
      };
    };
  };

  const { uploadId, uploadUrl, storageKey } = uploadUrlBody.data.upload;

  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": input.file.type },
    body: input.file,
  });

  if (!putResponse.ok) {
    throw new Error("Direct storage upload failed. Retry when online.");
  }

  const confirmResponse = await fetch(`${apiBase}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadId,
      storageKey,
      linkedEntityType: "visit_session",
      linkedEntityId: input.sessionId,
      fileName: input.file.name,
      mimeType: input.file.type,
      fileSize: input.file.size,
      visibility: "private",
    }),
  });

  if (!confirmResponse.ok) {
    const body = await confirmResponse.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Failed to confirm upload.");
  }

  const confirmBody = (await confirmResponse.json()) as {
    data: { document: { id: string } };
  };

  return {
    documentId: confirmBody.data.document.id,
    kind,
    fileName: input.file.name,
    mimeType: input.file.type,
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
    throw new Error("Could not open media.");
  }
  const body = (await response.json()) as {
    data: { url: string };
  };
  return body.data.url;
}
