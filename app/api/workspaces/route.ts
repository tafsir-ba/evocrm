import { handleRouteError, successResponse } from "@/server/api/responses";
import { requireAuth } from "@/server/auth/require-auth";
import { parseRequestOrThrow } from "@/server/validation/request";
import {
  createWorkspaceForUser,
  createWorkspaceInputSchema,
  listActiveWorkspacesForUser,
} from "@/server/services/workspaces";

export async function GET() {
  try {
    const session = await requireAuth();
    const workspaces = await listActiveWorkspacesForUser(session.user.id);

    return successResponse({ workspaces });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const body: unknown = await request.json();
    const input = parseRequestOrThrow(createWorkspaceInputSchema, body);
    const workspace = await createWorkspaceForUser(session.user.id, input);

    return successResponse({ workspace }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
