import Link from "next/link";

import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { AvatarWithName } from "@/components/ui/avatar";
import { FilterBar } from "@/components/layout/filter-bar";
import { IconPlus, IconChevronRight, IconChevronLeft } from "@/lib/icons";
import { leads } from "@/lib/mock-data";export const metadata = { title: "Leads — EvoHome CRM" };

export default function LeadsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Leads"
        description="Every contact entering your workspace. Convert qualified leads into opportunities."
        meta={
          <Badge tone="muted" size="sm">
            {leads.length} total
          </Badge>
        }
        actions={
          <Button leadingIcon={<IconPlus size={14} />}>New lead</Button>
        }
      />

      <div className="mb-4">
        <FilterBar
          search
          searchPlaceholder="Search leads by name, email or phone…"
          selects={[
            { label: "All statuses", options: ["New", "Contacted", "Qualified", "Lost"] },
            { label: "All sources", options: ["Website", "Google Ads", "Referral", "Portal"] },
            { label: "All assignees", options: ["John Doe", "Jane Roe", "Marc Berger"] },
          ]}
        />
      </div>

      <div className="bg-white border border-[var(--color-line)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] bg-[var(--color-canvas)] border-b border-[var(--color-line)]">
                <th className="text-left font-semibold px-5 py-3">Name</th>
                <th className="text-left font-semibold px-2 py-3">Source</th>
                <th className="text-left font-semibold px-2 py-3">Status</th>
                <th className="text-left font-semibold px-2 py-3">Assigned to</th>
                <th className="text-left font-semibold px-2 py-3">Created</th>
                <th className="text-left font-semibold px-2 py-3">Tags</th>
                <th className="text-right font-semibold px-5 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {leads.map((l) => (
                <tr
                  key={l.id}
                  className="hover:bg-[var(--color-canvas)] transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/leads/${l.id}`}
                      className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
                    >
                      {l.name}
                    </Link>
                    <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5">
                      {l.email}
                    </p>
                  </td>
                  <td className="px-2 py-3.5 text-[var(--color-ink-soft)]">
                    {l.source}
                  </td>
                  <td className="px-2 py-3.5">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="px-2 py-3.5">
                    <AvatarWithName user={l.assigned} />
                  </td>
                  <td className="px-2 py-3.5 text-[var(--color-ink-soft)] tabular">
                    {l.created}
                  </td>
                  <td className="px-2 py-3.5">
                    {l.tags.length === 0 ? (
                      <span className="text-[var(--color-ink-faint)]">—</span>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {l.tags.map((t) => (
                          <Badge key={t.label} tone={t.tone} size="sm">
                            {t.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/leads/${l.id}`}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
                      aria-label={`Open ${l.name}`}
                    >
                      <IconChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--color-line)] bg-[var(--color-canvas)]">
          <p className="text-[12.5px] text-[var(--color-ink-muted)]">
            Showing <span className="text-[var(--color-ink)] font-medium">1–7</span> of{" "}
            <span className="text-[var(--color-ink)] font-medium">128</span> leads
          </p>
          <div className="inline-flex items-center gap-1">
            <button className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-50" disabled>
              <IconChevronLeft size={14} />
            </button>
            {[1, 2, 3, "…", 19].map((p, i) => (
              <button
                key={i}
                className={
                  p === 1
                    ? "w-8 h-8 inline-flex items-center justify-center rounded-md bg-[var(--color-brand-600)] text-white text-[12.5px] font-semibold"
                    : "w-8 h-8 inline-flex items-center justify-center rounded-md border border-transparent text-[var(--color-ink-soft)] text-[12.5px] hover:bg-[var(--color-muted)]"
                }
                disabled={p === "…"}
              >
                {p}
              </button>
            ))}
            <button className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)]">
              <IconChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
