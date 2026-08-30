import { handleRouteError, successResponse } from "@/server/api/responses";
import {
  parseRequestOrThrow,
  validateSearchParams,
} from "@/server/validation/request";
import {
  companyListQuerySchema,
  createCompanyInputSchema,
} from "@/server/validation/companies";
import {
  createCompanyForWorkspace,
  listCompaniesForWorkspace,
} from "@/server/services/companies";
import { requireWorkspaceApiAccess } from "@/server/workspaces/require-workspace-api-access";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { workspace } = await requireWorkspaceApiAccess(workspaceSlug, "project:read");

    const url = new URL(request.url);
    const queryResult = validateSearchParams(companyListQuerySchema, url.searchParams);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const companies = await listCompaniesForWorkspace(workspace.id, {
      search: queryResult.data.search,
    });

    return successResponse({ companies });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { workspaceSlug } = await context.params;
    const { userId, workspace } = await requireWorkspaceApiAccess(workspaceSlug, [
      "project:create",
      "project:update",
    ]);

    const body: unknown = await request.json();
    const input = parseRequestOrThrow(createCompanyInputSchema, body);
    const { company, created } = await createCompanyForWorkspace(workspace.id, userId, input);

    return successResponse({ company, created }, { status: created ? 201 : 200 });
  } catch (error) {
    return handleRouteError(error);
  }
}
