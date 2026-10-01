import { NewsletterFormPage } from "@/components/newsletters/newsletter-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string; campaignId: string }>;

export const metadata = { title: "Newsletter — EvoHome CRM" };

export default async function EditNewsletterPage({ params }: { params: Params }) {
  const { workspaceSlug, campaignId } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (
    access.permissionDenied ||
    !hasPermission(access.context.membership.role.permissions, "campaign:read")
  ) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view newsletters.
        </p>
      </PageContainer>
    );
  }

  const canUpdate = hasPermission(
    access.context.membership.role.permissions,
    "campaign:update",
  );

  return (
    <PageContainer>
      <NewsletterFormPage
        workspaceSlug={workspaceSlug}
        mode="edit"
        campaignId={campaignId}
        canUpdate={canUpdate}
      />
    </PageContainer>
  );
}
