import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { FilterBar } from "@/components/domain/filter-bar";
import { KanbanColumn } from "@/components/domain/kanban-column";
import { KanbanCard } from "@/components/domain/kanban-card";
import { IconPlus } from "@/lib/icons";
import { opportunities } from "@/lib/mock-data";
import { workspacePath } from "@/lib/workspace-paths";
import type { PipelineStage } from "@/lib/mock-data";

/** Phase 1 mock pipeline stages — opportunity stages will load from workspace dictionaries in Phase 6. */
const MOCK_PIPELINE_STAGES: { key: PipelineStage; tone: string }[] = [
  { key: "New", tone: "#3b82f6" },
  { key: "Qualified", tone: "#0891b2" },
  { key: "Visit", tone: "#7c3aed" },
  { key: "Offer", tone: "#f59e0b" },
  { key: "Negotiation", tone: "#ea580c" },
  { key: "Won", tone: "#16a34a" },
  { key: "Lost", tone: "#94a3b8" },
];

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Pipeline — EvoHome CRM" };

export default async function PipelinePage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;

  const byStage = MOCK_PIPELINE_STAGES.map((stage) => ({
    ...stage,
    items: opportunities.filter((opportunity) => opportunity.stage === stage.key),
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

      <div className="-mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 overflow-x-auto pb-6">
        <div className="grid grid-flow-col auto-cols-[280px] gap-3 min-w-fit">
          {byStage.map((col) => {
            const totalM = col.items.reduce((sum, opportunity) => {
              const match = opportunity.value.match(/([\d.]+)\s*(K|M)?/i);
              if (!match) return sum;
              const amount = parseFloat(match[1]);
              const unit = (match[2] ?? "").toUpperCase();
              return sum + (unit === "K" ? amount / 1000 : amount);
            }, 0);
            const totalStr = totalM > 0 ? `CHF ${totalM.toFixed(2)}M` : "—";

            return (
              <KanbanColumn
                key={col.key}
                title={col.key}
                count={col.items.length}
                accentColor={col.tone}
                summary={
                  <>
                    Total{" "}
                    <span className="text-[var(--color-ink-soft)] font-semibold">
                      {totalStr}
                    </span>
                  </>
                }
                emptyLabel="No opportunities"
                cards={col.items.map((opportunity) => ({
                  id: opportunity.id,
                  title: opportunity.leadName,
                  subtitle: opportunity.propertyName,
                  metaLeft: opportunity.value,
                  metaRight: `${opportunity.probability}%`,
                  href: workspacePath(
                    workspaceSlug,
                    "opportunities",
                    opportunity.id,
                  ),
                }))}
                renderCard={(card) => (
                  <KanbanCard
                    title={card.title}
                    subtitle={card.subtitle}
                    metaLeft={card.metaLeft}
                    metaRight={card.metaRight}
                    href={card.href}
                    avatar={
                      <Avatar
                        user={
                          col.items.find((item) => item.id === card.id)!.assigned
                        }
                        size={20}
                      />
                    }
                  />
                )}
              />
            );
          })}
        </div>
      </div>
    </PageContainer>
  );
}
