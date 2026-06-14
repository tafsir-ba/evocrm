import { FeedbackAdminPanel } from "@/components/admin/feedback-admin-panel";
import { PageHeader } from "@/components/layout/page-header";
import { getOpenFeedbackCountForAdmin } from "@/server/services/feedback";

export default async function AdminFeedbackPage() {
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
