import { handleRouteError, successResponse } from "@/server/api/responses";
import { AppError } from "@/server/errors";
import { getEnv } from "@/server/env";
import { assertHubSpotWebhookRateLimit } from "@/server/security/hubspot-webhook-rate-limit";
import {
  assertHubSpotWebhookContentLength,
  assertHubSpotWebhookRawBodySize,
} from "@/server/security/hubspot-webhook-request-guards";
import { processHubSpotWebhookRequest } from "@/server/services/hubspot-lead-capture";

function resolveRequestUri(request: Request): string {
  const env = getEnv();
  const configuredBase =
    env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const incoming = new URL(request.url);

  if (configuredBase) {
    return `${configuredBase}${incoming.pathname}${incoming.search}`;
  }

  return `${incoming.origin}${incoming.pathname}${incoming.search}`;
}

export async function POST(request: Request) {
  try {
    assertHubSpotWebhookContentLength(request);
    await assertHubSpotWebhookRateLimit(request);

    const rawBody = await request.text();

    if (!rawBody.trim()) {
      throw new AppError("VALIDATION_ERROR", "Empty HubSpot webhook body.");
    }

    assertHubSpotWebhookRawBodySize(rawBody);

    const summary = await processHubSpotWebhookRequest({
      method: "POST",
      uri: resolveRequestUri(request),
      rawBody,
      timestampHeader: request.headers.get("x-hubspot-request-timestamp"),
      signatureHeader: request.headers.get("x-hubspot-signature-v3"),
    });

    return successResponse(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}
