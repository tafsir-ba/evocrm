import { handleRouteError, successResponse } from "@/server/api/responses";
import { requireAuth } from "@/server/auth/require-auth";

export async function GET() {
  try {
    const session = await requireAuth();

    return successResponse({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
