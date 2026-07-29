import "server-only";

import type { SendCampaignEmailAttachment } from "@/server/email/resend";
import {
  MAX_CAMPAIGN_EMAIL_ATTACHMENT_BYTES,
  MAX_CAMPAIGN_EMAIL_ATTACHMENTS,
} from "@/lib/campaign-email-attachments";
import { findDocumentsByIds } from "@/server/repositories/documents";
import { getObjectBuffer, isSpacesConfigured } from "@/server/storage/spaces";

export {
  MAX_CAMPAIGN_EMAIL_ATTACHMENT_BYTES,
  MAX_CAMPAIGN_EMAIL_ATTACHMENTS,
} from "@/lib/campaign-email-attachments";

export async function loadCampaignEmailAttachments(
  workspaceId: string,
  documentIds: string[] | undefined | null,
): Promise<
  | { ok: true; attachments: SendCampaignEmailAttachment[] }
  | { ok: false; error: string }
> {
  const ids = [...new Set((documentIds ?? []).filter(Boolean))];

  if (ids.length === 0) {
    return { ok: true, attachments: [] };
  }

  if (ids.length > MAX_CAMPAIGN_EMAIL_ATTACHMENTS) {
    return {
      ok: false,
      error: `A campaign email can include at most ${MAX_CAMPAIGN_EMAIL_ATTACHMENTS} attachments.`,
    };
  }

  if (!isSpacesConfigured()) {
    return {
      ok: false,
      error: "File storage is not configured for email attachments.",
    };
  }

  const documents = await findDocumentsByIds(workspaceId, ids);

  if (documents.length !== ids.length) {
    return {
      ok: false,
      error: "One or more attachments are missing or no longer available.",
    };
  }

  const totalBytes = documents.reduce((sum, document) => sum + document.fileSize, 0);
  if (totalBytes > MAX_CAMPAIGN_EMAIL_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: "Total attachment size exceeds the 20 MB limit for campaign emails.",
    };
  }

  try {
    const attachments: SendCampaignEmailAttachment[] = [];

    for (const document of documents) {
      const object = await getObjectBuffer(document.storageKey);
      attachments.push({
        filename: document.fileName,
        content: object.body,
        contentType: document.mimeType || object.contentType || "application/octet-stream",
      });
    }

    return { ok: true, attachments };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Could not load attachments: ${error.message}`
          : "Could not load attachments.",
    };
  }
}
