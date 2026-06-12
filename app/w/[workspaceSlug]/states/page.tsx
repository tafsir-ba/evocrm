import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { StateView } from "@/components/states/state-view";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PermissionDenied } from "@/components/ui/permission-denied";
import {
  TableSkeleton,
  CardSkeleton,
  KanbanSkeleton,
} from "@/components/states/skeletons";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { ComponentShowcase } from "@/components/states/component-showcase";

export const metadata = {
  title: "UI states — EvoHome CRM",
  robots: { index: false, follow: false },
};

/**
 * Internal QA/dev route — not part of locked V1 primary navigation.
 * Safe to remove or gate behind a dev flag before production beta.
 */
export default function StatesShowcase() {
  return (
    <PageContainer>
      <div
        role="note"
        className="mb-5 rounded-lg border border-dashed border-[var(--color-line-strong)] bg-[var(--color-canvas)] px-4 py-3 text-[12.5px] text-[var(--color-ink-muted)]"
      >
        Internal development route only — not production navigation. Visit{" "}
        <code className="text-[12px] text-[var(--color-ink-soft)]">
          /w/demo-workspace/states
        </code>{" "}
        for component/state QA. Remove or gate before beta.
      </div>
      <PageHeader
        title="Reusable UI states"
        description="State patterns used across every list, detail and dashboard view. Empty · loading · error · forbidden · not found · no workspace."
      />

      <h2 className="text-[14px] font-semibold text-[var(--color-ink)] mb-3 tracking-tight">
        Status badges
      </h2>
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status="New" />
          <StatusBadge status="Contacted" />
          <StatusBadge status="Qualified" />
          <StatusBadge status="Lost" />
          <StatusBadge status="Available" />
          <StatusBadge status="Reserved" />
          <StatusBadge status="Sold" />
          <StatusBadge status="Upcoming" />
          <StatusBadge status="Done" />
          <StatusBadge status="Pending" />
          <StatusBadge status="Overdue" />
          <Badge tone="info">Investor</Badge>
          <Badge tone="danger">Hot</Badge>
          <Badge tone="warn">VIP</Badge>
          <Badge tone="success">First-time buyer</Badge>
        </div>
      </Card>

      <h2 className="text-[14px] font-semibold text-[var(--color-ink)] mb-3 tracking-tight">
        Empty / error / forbidden / not found
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <EmptyState
          title="No leads yet"
          description="When prospects enter through forms, portals or referrals, they'll show up here."
          primaryAction={{ label: "Add lead" }}
          secondaryAction={{ label: "View examples" }}
        />
        <ErrorState
          title="Something went wrong"
          description="We couldn't load this view. Please retry, or contact your workspace admin if the issue persists."
          primaryAction={{ label: "Retry" }}
        />
        <PermissionDenied
          title="Permission denied"
          description="Your role doesn't grant access to this section. Ask an admin to update your role in Settings → Roles."
          secondaryAction={{ label: "Go to dashboard" }}
        />
        <StateView
          variant="notfound"
          title="Not found"
          description="The page or record you're looking for doesn't exist or has been archived."
          secondaryAction={{ label: "Back to dashboard" }}
        />
        <StateView
          variant="noworkspace"
          title="No workspace selected"
          description="Choose a workspace to continue, or ask an admin to invite you to one."
          primaryAction={{ label: "Select workspace" }}
        />
      </div>

      <h2 className="text-[14px] font-semibold text-[var(--color-ink)] mb-3 tracking-tight">
        Loading skeletons
      </h2>
      <div className="space-y-3 mb-6">
        <TableSkeleton rows={4} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <KanbanSkeleton />
      </div>

      <ComponentShowcase />

      <h2 className="text-[14px] font-semibold text-[var(--color-ink)] mb-3 tracking-tight mt-8">
        Form validation
      </h2>
      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-[var(--color-ink-soft)]">
              Email
            </label>
            <input
              defaultValue="not-an-email"
              className="w-full h-10 px-3 rounded-md border border-[var(--color-danger-fg)] text-[13.5px] focus:outline-none focus:ring-4 focus:ring-[var(--color-danger-border)]"
            />
            <p className="text-[12px] text-[var(--color-danger-fg)]">
              Please enter a valid work email address.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-[var(--color-ink-soft)]">
              Submitting…
            </label>
            <Button loading>Saving lead</Button>
          </div>
        </div>
      </Card>
    </PageContainer>
  );
}
