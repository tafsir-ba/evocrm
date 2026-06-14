import Link from "next/link";
import { redirect } from "next/navigation";

import { BillingPanel } from "@/components/settings/billing-panel";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Billing — Settings — EvoHome CRM" };

export default async function SettingsBillingPage({
  params,
}: {
  params: Params;
}) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (access.permissionDenied) {
    return (
      <PageContainer>
        <PageHeader title="Billing" />
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view settings.
        </p>
      </PageContainer>
    );
  }

  const permissions = access.context.membership.role.permissions;

  if (!hasPermission(permissions, "billing:manage")) {
    redirect(`/w/${workspaceSlug}/settings`);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Billing"
        description="Plan and subscription management (placeholder)."
        actions={
          <Link
            href={`/w/${workspaceSlug}/settings`}
            className="text-[13px] text-[var(--color-brand-600)] hover:underline"
          >
            Back to Settings
          </Link>
        }
      />
      <BillingPanel workspaceSlug={workspaceSlug} />
    </PageContainer>
  );
}
