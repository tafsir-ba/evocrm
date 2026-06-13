import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { FilterBar } from "@/components/domain/filter-bar";
import { KanbanColumn } from "@/components/domain/kanban-column";
import { KanbanCard } from "@/components/domain/kanban-card";
import { IconPlus } from "@/lib/icons";
import { opportunities } from "@/lib/mock-data";
import { workspacePath } from "@/lib/workspace-paths";
import { getOpportunityStatusStagesForSlug } from "@/server/dictionaries/opportunity-stages";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Pipeline — EvoHome CRM" };

export default async function PipelinePage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const stages = await getOpportunityStatusStagesForSlug(workspaceSlug);

  const byStage = stages.map((stage) => ({
    id: stage.id,
    key: stage.key,
    label: stage.label,
    color: stage.color,
    behavior: stage.behavior,
    items: opportunities.filter((opportunity) => opportunity.stage === stage.label),
  }));

  return (
    <PageContainer className="pb-0">
      <PageHeader
        title="Pipeline"
        description="Drag opportunities through your sales stages. Column headers load from workspace opportunity status dictionaries."
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
                key={col.id}
                title={col.label}
                count={col.items.length}
                accentColor={col.color}
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
