import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  listSenderEmailsForDomain,
  listSendingDomainsForWorkspace,
} from "@/server/services/sending-domains";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";
import { validateSearchParams } from "@/server/validation/request";
import { senderEmailQuerySchema } from "@/server/validation/sending-domains";
import { AppError } from "@/server/errors";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(
      workspaceSlug,
      "campaign:read",
    );

    const url = new URL(request.url);
    const queryResult = validateSearchParams(senderEmailQuerySchema, url.searchParams);

    if (!queryResult.success) {
      throw queryResult.error;
    }

    const domains = await listSendingDomainsForWorkspace(workspace.id);
    const domain = domains.find((item) => item.id === queryResult.data.sendingDomainId);

    if (!domain) {
      throw new AppError("NOT_FOUND", "Sending domain not found.");
    }

    if (domain.status !== "verified") {
      return successResponse({ senderEmails: [] });
    }

    return successResponse({ senderEmails: listSenderEmailsForDomain(domain) });
  } catch (error) {
    return handleRouteError(error);
  }
}
