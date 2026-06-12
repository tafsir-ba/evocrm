import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { FilterBar } from "@/components/layout/filter-bar";
import {
  IconPlus,
  IconMore,
} from "@/lib/icons";
import { opportunities, pipelineOverview } from "@/lib/mock-data";
import Link from "next/link";
import type { PipelineStage } from "@/lib/mock-data";

const STAGES: { key: PipelineStage; tone: string }[] = [
  { key: "New", tone: "#3b82f6" },
  { key: "Qualified", tone: "#0891b2" },
  { key: "Visit", tone: "#7c3aed" },
  { key: "Offer", tone: "#f59e0b" },
  { key: "Negotiation", tone: "#ea580c" },
  { key: "Won", tone: "#16a34a" },
  { key: "Lost", tone: "#94a3b8" },
];

export const metadata = { title: "Pipeline — EvoHome CRM" };

export default function PipelinePage() {
  const byStage = STAGES.map((s) => ({
    ...s,
    items: opportunities.filter((o) => o.stage === s.key),
    overview: pipelineOverview.find((p) => p.stage === s.key),
  }));

  return (
    <PageContainer className="pb-0">
      <PageHeader
        title="Pipeline"
        description="Drag opportunities through your sales stages. Stages and dictionaries are workspace-managed."
        actions={
          <Button leadingIcon={<IconPlus size={14} />}>New opportunity</Button>
        }
      />
      <div className="mb-4">
        <FilterBar
          search
          searchPlaceholder="Search opportunities…"
          selects={[
            { label: "All assignees", options: ["John Doe", "Jane Roe", "Marc Berger"] },
            { label: "All projects", options: ["Green View", "Lake Residences", "Sunset Villas"] },
          ]}
        />
      </div>

      {/* Kanban horizontal scroll */}
      <div className="-mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 overflow-x-auto pb-6">
        <div className="grid grid-flow-col auto-cols-[280px] gap-3 min-w-fit">
          {byStage.map((col) => {
            const totalM = col.items.reduce((sum, o) => {
              const m = o.value.match(/([\d.]+)\s*(K|M)?/i);
              if (!m) return sum;
              const n = parseFloat(m[1]);
              const unit = (m[2] ?? "").toUpperCase();
              return sum + (unit === "K" ? n / 1000 : n);
            }, 0);
            const totalStr = totalM > 0 ? `CHF ${totalM.toFixed(2)}M` : "—";
            return (
              <div
                key={col.key}
                className="flex flex-col bg-[var(--color-canvas)] border border-[var(--color-line)] rounded-xl"
              >
                <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: col.tone }}
                    />
                    <span className="text-[13px] font-semibold text-[var(--color-ink)]">
                      {col.key}
                    </span>
                    <span className="text-[11.5px] text-[var(--color-ink-muted)] tabular bg-white border border-[var(--color-line)] rounded-md px-1.5 py-[1px]">
                      {col.items.length}
                    </span>
                  </div>
                  <button
                    aria-label="Column actions"
                    className="w-6 h-6 inline-flex items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-white"
                  >
                    <IconMore size={14} />
                  </button>
                </div>
                <div className="px-3 pb-2 text-[11.5px] text-[var(--color-ink-muted)] tabular">
                  Total{" "}
                  <span className="text-[var(--color-ink-soft)] font-semibold">
                    {totalStr}
                  </span>
                </div>

                <div className="flex-1 px-2 pb-2 space-y-2 min-h-[200px]">
                  {col.items.length === 0 ? (
                    <div className="border border-dashed border-[var(--color-line-strong)] rounded-lg p-4 text-center">
                      <p className="text-[12px] text-[var(--color-ink-muted)]">
                        No opportunities
                      </p>
                    </div>
                  ) : (
                    col.items.map((o) => (
                      <Link
                        href={`/opportunities/${o.id}`}
                        key={o.id}
                        className="block bg-white border border-[var(--color-line)] rounded-lg p-3 hover:border-[var(--color-brand-300)] hover:shadow-[var(--shadow-sm)] transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13.5px] font-semibold text-[var(--color-ink)] leading-tight">
                            {o.leadName}
                          </p>
                          <Avatar user={o.assigned} size={20} />
                        </div>
                        <p className="text-[12px] text-[var(--color-ink-muted)] mt-1 truncate">
                          {o.propertyName}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[12.5px] font-semibold text-[var(--color-brand-700)] tabular">
                            {o.value}
                          </span>
                          <span className="text-[11px] text-[var(--color-ink-faint)] tabular">
                            {o.probability}%
                          </span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>

                <button className="m-2 mt-1 h-8 inline-flex items-center justify-center gap-1.5 text-[12.5px] font-medium text-[var(--color-ink-muted)] border border-dashed border-[var(--color-line)] rounded-lg hover:text-[var(--color-brand-700)] hover:border-[var(--color-brand-300)] hover:bg-white transition-colors">
                  <IconPlus size={13} /> Add card
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </PageContainer>
  );
}
