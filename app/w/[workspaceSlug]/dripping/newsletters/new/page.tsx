import { NewsletterFormPage } from "@/components/newsletters/newsletter-form-page";
import { PageContainer } from "@/components/layout/page-header";
import { hasPermission } from "@/server/permissions/permissions";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "New newsletter — EvoHome CRM" };

export default async function NewNewsletterPage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);

  if (
    access.permissionDenied ||
    !hasPermission(access.context.membership.role.permissions, "campaign:create")
  ) {
    return (
      <PageContainer>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to create newsletters.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <NewsletterFormPage workspaceSlug={workspaceSlug} mode="create" />
    </PageContainer>
  );
}
