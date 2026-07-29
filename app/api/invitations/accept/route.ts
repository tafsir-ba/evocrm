import { handleRouteError, successResponse } from "@/server/api/responses";
import { requireAuth } from "@/server/auth/require-auth";
import { assertProjectSharingEnabled } from "@/server/features/project-sharing";
import { acceptProjectInvitation } from "@/server/services/project-invitations";
import { parseRequestOrThrow } from "@/server/validation/request";
import { z } from "zod";

const acceptSchema = z.object({
  token: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  try {
    assertProjectSharingEnabled();
    const session = await requireAuth();
    const body = parseRequestOrThrow(acceptSchema, await request.json());

    const result = await acceptProjectInvitation({
      token: body.token,
      userId: session.user.id,
      userEmail: session.user.email,
    });

    return successResponse(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
