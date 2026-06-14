import { handleRouteError, successResponse } from "@/server/api/responses";
import { AppError } from "@/server/errors";
import {
  buildWebsiteLeadPayloadSummary,
  writeIntegrationLog,
} from "@/server/services/integration-logs";
import {
  hashIntegrationApiKey,
  parseIntegrationApiKeyFromRequest,
} from "@/server/services/integration-api-keys";
import { findWebsiteIntegrationByApiKeyHash } from "@/server/repositories/integrations";
import { assertWebsiteLeadRateLimit } from "@/server/security/website-lead-rate-limit";
import { captureWebsiteLeadFromRequest } from "@/server/services/website-lead-capture";
import { parseRequestOrThrow } from "@/server/validation/request";
import { websiteLeadCaptureInputSchema } from "@/server/validation/website-lead-capture";

export async function POST(request: Request) {
  try {
    const rawApiKey = parseIntegrationApiKeyFromRequest(request);

    assertWebsiteLeadRateLimit(request, rawApiKey);

    if (!rawApiKey) {
      throw new AppError("UNAUTHENTICATED", "Invalid or missing API key.");
    }

    const body: unknown = await request.json();

    let input;

    try {
      input = parseRequestOrThrow(websiteLeadCaptureInputSchema, body);
    } catch (error) {
      if (error instanceof AppError && error.code === "VALIDATION_ERROR") {
        const integration = await findWebsiteIntegrationByApiKeyHash(
          hashIntegrationApiKey(rawApiKey),
        );

        if (integration) {
          await writeIntegrationLog({
            workspaceId: integration.workspaceId,
            integrationId: integration.id,
            direction: "inbound",
            status: "failed",
            eventType: "website.lead.failed",
            payloadSummary: buildWebsiteLeadPayloadSummary({
              validationFields: Object.keys(error.details ?? {}),
            }),
            error,
          });
        }
      }

      throw error;
    }

    const result = await captureWebsiteLeadFromRequest(request, input);

    return successResponse({
      leadId: result.leadId,
      duplicate: result.duplicate,
      idempotent: result.idempotent,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
