import { handleRouteError, successResponse } from "@/server/api/responses";
import { requireAuth } from "@/server/auth/require-auth";
import { listSharedProjectsForUser } from "@/server/services/projects";

export async function GET() {
  try {
    const session = await requireAuth();
    const projects = await listSharedProjectsForUser(session.user.id);
    return successResponse({ projects });
  } catch (error) {
    return handleRouteError(error);
  }
}
