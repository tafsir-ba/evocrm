import { notFound } from "next/navigation";

import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/domain/status-badge";
import { Avatar, AvatarWithName } from "@/components/ui/avatar";
import { Tabs } from "@/components/ui/tabs";
import { StateView } from "@/components/states/state-view";
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconNote,
  IconFile,
} from "@/lib/icons";
import { activities, opportunities, leads, properties } from "@/lib/mock-data";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string; opportunityId: string }>;

/** Phase 1 mock stage progression labels only. */
const MOCK_STAGE_LABELS = [
  "New",
  "Qualified",
  "Visit",
  "Offer",
  "Negotiation",
  "Won/Lost",
];

export async function generateMetadata({ params }: { params: Params }) {
  const { opportunityId } = await params;
  const op = opportunities.find((o) => o.id === opportunityId);
  return { title: op ? `${op.leadName} — ${op.propertyName}` : "Opportunity" };
}

export default async function OpportunityDetailPage({ params }: { params: Params }) {
  const { workspaceSlug, opportunityId } = await params;
  const op = opportunities.find((o) => o.id === opportunityId);
  if (!op) notFound();

  const lead = leads.find((l) => l.name === op.leadName) ?? leads[0];
  const prop = properties.find((p) => p.title === op.propertyName) ?? properties[0];

  const currentStageIndex = (() => {
    if (op.stage === "Won" || op.stage === "Lost") return 5;
    return MOCK_STAGE_LABELS.indexOf(op.stage);
  })();

  return (
    <PageContainer>
      <PageHeader
        back={{
          href: workspacePath(workspaceSlug, "pipeline"),
          label: "Back to pipeline",
        }}
        title={
          <span className="flex items-center gap-2 flex-wrap">
            {op.leadName} — {op.propertyName}
            <Badge tone="info">{op.stage}</Badge>
          </span>
        }
        description={`Opportunity ${op.id} · Expected close ${op.expectedClose}`}
        meta={
          <span className="text-[18px] font-bold tabular text-[var(--color-brand-700)] ml-3">
            {op.value}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" leadingIcon={<IconNote size={14} />}>
              Add note
            </Button>
            <Button leadingIcon={<IconCheck size={14} />}>Mark as won</Button>
          </>
        }
      />

      {/* Summary row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card>
          <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-2">
            Lead
          </p>
          <div className="flex items-center gap-3">
            <Avatar
              user={{
                id: lead.id,
                initials: lead.name.split(" ").map((s) => s[0]).join("").slice(0, 2),
                name: lead.name,
              }}
              size={36}
            />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[var(--color-ink)] truncate">
                {lead.name}
              </p>
              <p className="text-[12px] text-[var(--color-ink-muted)] truncate">
                {lead.email}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-2">
            Property
          </p>
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-md overflow-hidden bg-[var(--color-muted)] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={prop.imageUrl} alt="" className="w-full h-full object-cover" />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[var(--color-ink)] truncate">
                {prop.title}
              </p>
              <p className="text-[12px] text-[var(--color-ink-muted)] tabular truncate">
                {prop.price} · {prop.rooms} rooms
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-2">
            Assigned
          </p>
          <AvatarWithName user={op.assigned} size={30} />
          <div className="mt-3 flex items-center gap-3 text-[12.5px] text-[var(--color-ink-soft)]">
            <span className="inline-flex items-center gap-1">
              <IconCalendar size={13} />
              {op.expectedClose}
            </span>
            <span className="text-[var(--color-line-strong)]">·</span>
            <span className="tabular">{op.probability}% probability</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Stage progression */}
        <Card className="xl:col-span-1 self-start">
          <CardHeader title="Pipeline stage" subtitle="Current progression" />
          <ol className="relative pl-5">
            <span className="absolute left-1.5 top-2 bottom-2 w-px bg-[var(--color-line)]" />
            {MOCK_STAGE_LABELS.map((stage, i) => {
              const isCurrent = i === currentStageIndex;
              const isPast = i < currentStageIndex;
              return (
                <li
                  key={stage}
                  className={`relative mb-3 last:mb-0 ${
                    isCurrent
                      ? "px-3 py-2 -mx-3 rounded-lg bg-[var(--color-brand-50)] border border-[var(--color-brand-100)]"
                      : ""
                  }`}
                >
                  <span
                    className={`absolute ${
                      isCurrent ? "-left-[12px] top-3" : "-left-[15px] top-1"
                    } w-3 h-3 rounded-full border-2 border-white`}
                    style={{
                      background: isPast
                        ? "var(--color-success-fg)"
                        : isCurrent
                          ? "var(--color-brand-600)"
                          : "var(--color-line-strong)",
                    }}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`text-[13.5px] ${
                        isCurrent
                          ? "font-semibold text-[var(--color-brand-800)]"
                          : isPast
                            ? "text-[var(--color-ink-soft)]"
                            : "text-[var(--color-ink-muted)]"
                      }`}
                    >
                      {stage}
                    </p>
                    {isCurrent && (
                      <span className="text-[11px] font-medium text-[var(--color-brand-700)]">
                        Current
                      </span>
                    )}
                  </div>
                  {isCurrent && (
                    <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5 tabular">
                      Since May 27, 2024
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>

        {/* Tabs main */}
        <Card padded={false} className="xl:col-span-2">
          <Tabs
            className="px-5"
            items={[
              {
                key: "overview",
                label: "Overview",
                content: (
                  <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Info label="Budget" value={lead.budget ?? "—"} />
                    <Info label="Probability" value={`${op.probability}%`} />
                    <Info label="Expected close" value={op.expectedClose} />
                    <Info label="Notes" value="Interested in a 3-room apartment with parking." />
                  </div>
                ),
              },
              {
                key: "next",
                label: "Next activity",
                content: (
                  <div className="px-5 pb-5">
                    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-4 flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white text-[var(--color-brand-600)] border border-[var(--color-line)]">
                        <IconClock size={16} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-[var(--color-ink)]">
                          Property Visit
                        </p>
                        <p className="text-[12.5px] text-[var(--color-ink-muted)] tabular">
                          May 30, 2024 — 2:00 PM
                        </p>
                      </div>
                      <Button size="sm" variant="secondary">
                        Reschedule
                      </Button>
                      <Button size="sm" leadingIcon={<IconCheck size={13} />}>
                        Mark as done
                      </Button>
                    </div>
                  </div>
                ),
              },
              {
                key: "acts",
                label: "Activities",
                count: 3,
                content: (
                  <div className="px-5 pb-5 space-y-3">
                    {activities.slice(0, 3).map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--color-line)]"
                      >
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-semibold text-[var(--color-ink)] truncate">
                            {a.title}
                          </p>
                          <p className="text-[12px] text-[var(--color-ink-muted)] tabular">
                            {a.dueDate} · by {a.assigned.name}
                          </p>
                        </div>
                        <StatusBadge status={a.status} size="sm" />
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                key: "notes",
                label: "Notes",
                content: (
                  <div className="px-5 pb-5">
                    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3 mb-3">
                      <p className="text-[13.5px] text-[var(--color-ink)] leading-relaxed">
                        Client interested in 3-room apartment with parking and a south-facing balcony. Confirmed budget up to CHF 1.2M.
                      </p>
                      <p className="text-[11.5px] text-[var(--color-ink-muted)] mt-1.5">
                        Marc Berger · May 27, 2024
                      </p>
                    </div>
                    <textarea
                      placeholder="Add a note…"
                      className="w-full min-h-[88px] rounded-lg border border-[var(--color-line)] p-3 text-[13.5px] focus:outline-none focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[var(--color-brand-100)]"
                    />
                  </div>
                ),
              },
              {
                key: "files",
                label: "Files",
                content: (
                  <div className="px-5 pb-5">
                    <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] rounded-lg">
                      {["Brochure_GreenView.pdf", "OfferDraft_v2.pdf"].map((f) => (
                        <li
                          key={f}
                          className="flex items-center justify-between gap-3 p-3 hover:bg-[var(--color-canvas)]"
                        >
                          <span className="flex items-center gap-3 min-w-0">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-[var(--color-muted)] text-[var(--color-ink-muted)]">
                              <IconFile size={14} />
                            </span>
                            <span className="text-[13.5px] text-[var(--color-ink)] truncate">
                              {f}
                            </span>
                          </span>
                          <span className="text-[11.5px] text-[var(--color-ink-faint)]">
                            142 KB
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              },
              {
                key: "docs",
                label: "Documents",
                content: (
                  <div className="px-5 pb-5">
                    <StateView
                      variant="empty"
                      compact
                      title="No documents generated yet"
                      description="Contracts and offers will appear here once generated from the workspace."
                      primaryAction={{ label: "Generate document" }}
                    />
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </div>
    </PageContainer>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-1">
        {label}
      </p>
      <p className="text-[13.5px] text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
