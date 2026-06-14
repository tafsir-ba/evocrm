import { FeedbackAdminPanel } from "@/components/admin/feedback-admin-panel";
import { PageHeader } from "@/components/layout/page-header";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { isPlatformAdminEmail } from "@/server/auth/platform-admin";
import { requireAuth } from "@/server/auth/require-auth";
import { getOpenFeedbackCountForAdmin } from "@/server/services/feedback";

export default async function AdminFeedbackPage() {
  const session = await requireAuth();

  if (!isPlatformAdminEmail(session.user.email)) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <PermissionDenied
          title="Platform admin required"
          description="Your account is not configured as a platform administrator."
        />
      </div>
    );
  }

  const openCount = await getOpenFeedbackCountForAdmin();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title="Feedback"
        description={`Platform-wide user feedback queue. ${openCount} open report${openCount === 1 ? "" : "s"}.`}
      />
      <FeedbackAdminPanel />
    </div>
  );
}
