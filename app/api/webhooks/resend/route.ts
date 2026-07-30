import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  processResendWebhookPayload,
  verifyResendWebhookOrThrow,
} from "@/server/services/resend-webhook";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const providerEventId = verifyResendWebhookOrThrow(rawBody, {
      svixId: request.headers.get("svix-id"),
      svixTimestamp: request.headers.get("svix-timestamp"),
      svixSignature: request.headers.get("svix-signature"),
    });

    const payload = JSON.parse(rawBody) as {
      type?: string;
      created_at?: string;
      data?: {
        email_id?: string;
        created_at?: string;
        bounce?: { message?: string; type?: string };
        failed?: { reason?: string };
        tags?: Record<string, string>;
      };
    };

    const result = await processResendWebhookPayload(payload, providerEventId);

    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
