import { handleRouteError, successResponse } from "@/server/api/responses";
import { AppError } from "@/server/errors";
import { createDocumentFromDirectUploadForWorkspace } from "@/server/services/documents";
import { DOCUMENT_VISIBILITY_VALUES } from "@/server/validation/documents";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import {
  MAX_VISIT_MEDIA_FILE_SIZE_BYTES,
  resolveVisitMediaMimeType,
} from "@/lib/visit-notes";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

/** Allow large visit media (up to 50 MB) on long-running Node hosts. */
export const maxDuration = 120;

/** Multipart overhead allowance above declared file size. */
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

function isVisibility(
  value: string,
): value is (typeof DOCUMENT_VISIBILITY_VALUES)[number] {
  return (DOCUMENT_VISIBILITY_VALUES as readonly string[]).includes(value);
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { userId, workspace, permissions } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "document:create",
    );

    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_VISIT_MEDIA_FILE_SIZE_BYTES + MULTIPART_OVERHEAD_BYTES
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          `File exceeds maximum allowed size of ${MAX_VISIT_MEDIA_FILE_SIZE_BYTES} bytes.`,
        );
      }
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const linkedEntityTypeRaw = String(formData.get("linkedEntityType") ?? "");
    const linkedEntityId = String(formData.get("linkedEntityId") ?? "").trim();
    const visibilityRaw = String(formData.get("visibility") ?? "private");
    const ownerIdRaw = formData.get("ownerId");
    const declaredMime = String(formData.get("mimeType") ?? "").trim();

    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "A file is required.");
    }

    // Visit Notes CORS bypass is scoped to visit_session media only.
    if (linkedEntityTypeRaw !== "visit_session") {
      throw new AppError(
        "VALIDATION_ERROR",
        "Direct upload is only available for visit session media.",
      );
    }

    if (!/^[a-fA-F0-9]{24}$/.test(linkedEntityId)) {
      throw new AppError("VALIDATION_ERROR", "Invalid linked entity id.");
    }

    if (!isVisibility(visibilityRaw)) {
      throw new AppError("VALIDATION_ERROR", "Invalid visibility.");
    }

    const mimeType =
      declaredMime ||
      resolveVisitMediaMimeType({ name: file.name, type: file.type });

    const body = Buffer.from(await file.arrayBuffer());
    if (body.byteLength > MAX_VISIT_MEDIA_FILE_SIZE_BYTES) {
      throw new AppError(
        "VALIDATION_ERROR",
        `File exceeds maximum allowed size of ${MAX_VISIT_MEDIA_FILE_SIZE_BYTES} bytes.`,
      );
    }

    const document = await createDocumentFromDirectUploadForWorkspace(
      workspace.id,
      userId,
      permissions,
      {
        linkedEntityType: "visit_session",
        linkedEntityId,
        fileName: file.name,
        mimeType,
        fileSize: body.byteLength,
        visibility: visibilityRaw,
        ownerId:
          typeof ownerIdRaw === "string" && ownerIdRaw.trim()
            ? ownerIdRaw.trim()
            : undefined,
        body,
      },
    );

    return successResponse({ document }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
