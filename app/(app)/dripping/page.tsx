import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { StateView } from "@/components/states/state-view";
import { FilterBar } from "@/components/layout/filter-bar";
import {
  IconPlus,
  IconMail,
  IconChevronRight,
  IconMore,
} from "@/lib/icons";
import { campaigns } from "@/lib/mock-data";

export const metadata = { title: "Dripping — EvoHome CRM" };

export default function DrippingPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Dripping"
        description="Simple email follow-up campaigns. Enroll lead segments into multi-step sequences."
        meta={<Badge tone="muted" size="sm">{campaigns.length} campaigns</Badge>}
        actions={<Button leadingIcon={<IconPlus size={14} />}>New campaign</Button>}
      />

      <div className="mb-4">
        <FilterBar
          search
          searchPlaceholder="Search campaigns…"
          selects={[
            { label: "All statuses", options: ["Active", "Scheduled", "Paused", "Draft"] },
            { label: "All audiences", options: ["Investors", "Qualified leads", "Cold leads"] },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {campaigns.map((c) => (
          <Card key={c.id} className="!p-0 group">
            <div className="p-5 border-b border-[var(--color-line)]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[var(--color-ink)] tracking-tight truncate">
                    {c.name}
                  </p>
                  <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5 truncate">
                    Audience · {c.audience}
                  </p>
                </div>
                <button
                  aria-label="Campaign actions"
                  className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)]"
                >
                  <IconMore size={14} />
                </button>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <StatusBadge status={c.status} />
                <span className="text-[12px] text-[var(--color-ink-muted)] tabular">
                  · {c.enrolled} enrolled
                </span>
              </div>
            </div>

            {/* Steps preview */}
            <div className="p-5">
              <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-3">
                Steps ({c.steps})
              </p>
              <ol className="space-y-2">
                {Array.from({ length: Math.min(c.steps, 3) }).map((_, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)]"
                  >
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white border border-[var(--color-line)] text-[12px] font-semibold text-[var(--color-ink-soft)]">
                      {i + 1}
                    </span>
                    <span className="inline-flex items-center justify-center text-[var(--color-brand-600)]">
                      <IconMail size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-[var(--color-ink)] truncate">
                        {i === 0 ? "Welcome email" : i === 1 ? "Property highlights" : "Follow-up reminder"}
                      </p>
                      <p className="text-[11.5px] text-[var(--color-ink-muted)]">
                        Day {[0, 3, 7][i]}
                      </p>
                    </div>
                  </li>
                ))}
                {c.steps > 3 && (
                  <li className="text-[12px] text-[var(--color-ink-muted)] pl-1">
                    + {c.steps - 3} more steps
                  </li>
                )}
              </ol>

              <div className="mt-4 flex items-center justify-between text-[12px]">
                <span className="text-[var(--color-ink-muted)]">
                  Last send · <span className="text-[var(--color-ink-soft)] tabular">{c.lastSent ?? "—"}</span>
                </span>
                <a
                  href="#"
                  className="text-[var(--color-brand-700)] font-medium inline-flex items-center gap-1 hover:underline"
                >
                  Open <IconChevronRight size={12} />
                </a>
              </div>
            </div>
          </Card>
        ))}

        {/* New campaign tile */}
        <button
          type="button"
          className="rounded-xl border border-dashed border-[var(--color-line-strong)] bg-white p-8 text-center hover:bg-[var(--color-canvas)] hover:border-[var(--color-brand-300)] focus-ring transition-colors flex flex-col items-center justify-center gap-2 min-h-[260px]"
        >
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
            <IconPlus size={16} />
          </span>
          <p className="text-[13.5px] font-semibold text-[var(--color-ink)]">
            New campaign
          </p>
          <p className="text-[12px] text-[var(--color-ink-muted)] max-w-[200px]">
            Build a simple multi-step email drip
          </p>
        </button>
      </div>

      {/* Send log preview */}
      <div className="mt-6">
        <h2 className="text-[15px] font-semibold text-[var(--color-ink)] mb-3 tracking-tight">
          Recent send log
        </h2>
        <StateView
          variant="empty"
          compact
          title="Send log will appear here"
          description="Once you publish a campaign, individual email sends and their delivery status will stream in this log."
          secondaryAction={{ label: "Learn about delivery" }}
        />
      </div>
    </PageContainer>
  );
}
