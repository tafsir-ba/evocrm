import { Suspense } from "react";

import {
  PropertyFormPage,
} from "@/components/properties/property-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { isSafeOpportunityReturnTo } from "@/lib/opportunity-link-flow";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string }>;
type SearchParams = Promise<{ projectId?: string; returnTo?: string }>;

export const metadata = { title: "New property — EvoHome CRM" };

export default async function NewPropertyPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { workspaceSlug } = await params;
  const { projectId, returnTo: rawReturnTo } = await searchParams;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to view properties."
        />
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  if (!hasPermission(permissions, "property:create")) {
    return (
      <PageContainer>
        <PermissionDenied
          title="Permission denied"
          description="You do not have permission to create properties."
        />
      </PageContainer>
    );
  }

  const returnTo =
    rawReturnTo && isSafeOpportunityReturnTo(rawReturnTo, workspaceSlug)
      ? rawReturnTo
      : undefined;
  const cancelHref = returnTo ?? workspacePath(workspaceSlug, "properties");

  return (
    <PageContainer>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        }
      >
        <PropertyFormPage
          workspaceSlug={workspaceSlug}
          defaultCurrency={access.context.workspace.defaultCurrency}
          mode="create"
          initialValues={projectId ? { projectId } : undefined}
          returnTo={returnTo}
          canCreateDocument={hasPermission(permissions, "document:create")}
          cancelHref={cancelHref}
          back={{
            href: cancelHref,
            label: returnTo ? "Back to opportunity" : "Back to properties",
          }}
        />
      </Suspense>
    </PageContainer>
  );
}
