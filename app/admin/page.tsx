import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { PLATFORM_ADMIN_NAV } from "@/lib/platform-admin-navigation";
import { IconChevronRight, IconInbox, IconShield } from "@/lib/icons";
import { getOpenFeedbackCountForAdmin } from "@/server/services/feedback";

const ADMIN_CARD_ICONS = {
  overview: IconShield,
  feedback: IconInbox,
} as const;

export default async function AdminOverviewPage() {
  const openFeedbackCount = await getOpenFeedbackCountForAdmin();
  const tools = PLATFORM_ADMIN_NAV.filter((item) => item.segment !== "overview");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title="Platform admin"
        description="Cross-workspace operator tools for EvoHome CRM."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-[var(--color-line)] bg-white p-5">
          <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            Open feedback
          </p>
          <p className="mt-2 text-[32px] font-semibold text-[var(--color-ink)]">
            {openFeedbackCount}
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
            Reports awaiting triage
          </p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-[14px] font-semibold text-[var(--color-ink)]">Admin tools</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {tools.map((item) => {
            const Icon = ADMIN_CARD_ICONS[item.segment];
            const metric =
              item.segment === "feedback" ? `${openFeedbackCount} open` : undefined;

            return (
              <Link
                key={item.segment}
                href={item.href}
                className="group flex items-start gap-4 rounded-xl border border-[var(--color-line)] bg-white p-5 transition-colors hover:border-[var(--color-brand-600)]"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[var(--color-ink)]">
                      {item.label}
                    </span>
                    {metric && (
                      <span className="rounded-full bg-[var(--color-warn-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-warn-fg)]">
                        {metric}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-[12px] text-[var(--color-ink-muted)]">
                    {item.description}
                  </span>
                </span>
                <IconChevronRight
                  size={16}
                  className="mt-1 shrink-0 text-[var(--color-ink-muted)] group-hover:text-[var(--color-brand-600)]"
                />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
