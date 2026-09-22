import { handleRouteError, successResponse } from "@/server/api/responses";
import { AppError } from "@/server/errors";
import { createDocumentFromDirectUploadForWorkspace } from "@/server/services/documents";
import {
  DOCUMENT_LINKED_ENTITY_TYPES,
  DOCUMENT_VISIBILITY_VALUES,
  type DocumentLinkedEntityType,
} from "@/server/validation/documents";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import { resolveVisitMediaMimeType } from "@/lib/visit-notes";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

/** Allow large visit media (up to 50 MB) on long-running Node hosts. */
export const maxDuration = 120;

function isLinkedEntityType(value: string): value is DocumentLinkedEntityType {
  return (DOCUMENT_LINKED_ENTITY_TYPES as readonly string[]).includes(value);
}

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

    if (!isLinkedEntityType(linkedEntityTypeRaw)) {
      throw new AppError("VALIDATION_ERROR", "A valid linked entity type is required.");
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
    const document = await createDocumentFromDirectUploadForWorkspace(
      workspace.id,
      userId,
      permissions,
      {
        linkedEntityType: linkedEntityTypeRaw,
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
