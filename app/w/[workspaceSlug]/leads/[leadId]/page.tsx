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
  IconMail,
  IconMapPin,
  IconPhone,
  IconPlus,
  IconCheck,
  IconNote,
  IconClock,
  IconBriefcase,
  IconExternalLink,
} from "@/lib/icons";
import { Timeline } from "@/components/domain/timeline";
import { activities, leads, opportunities } from "@/lib/mock-data";
import { workspacePath } from "@/lib/workspace-paths";

type Params = Promise<{ workspaceSlug: string; leadId: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { leadId } = await params;
  const lead = leads.find((l) => l.id === leadId);
  return { title: lead ? `${lead.name} — Lead` : "Lead" };
}

export default async function LeadDetailPage({ params }: { params: Params }) {
  const { workspaceSlug, leadId } = await params;
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) notFound();

  const relatedActivities = activities.slice(0, 4);
  const relatedOpps = opportunities.filter((o) => o.leadName === lead.name);

  return (
    <PageContainer>
      <PageHeader
        back={{
          href: workspacePath(workspaceSlug, "leads"),
          label: "Back to leads",
        }}
        title={
          <span className="flex items-center gap-2.5 flex-wrap">
            {lead.name}
            <StatusBadge status={lead.status} />
          </span>
        }
        description={`${lead.source} · ${lead.city} · Created ${lead.created}`}
        actions={
          <>
            <Button variant="secondary" leadingIcon={<IconMail size={14} />}>
              Email
            </Button>
            <Button leadingIcon={<IconPlus size={14} />}>New activity</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Identity card */}
        <Card className="xl:col-span-1">
          <div className="flex items-center gap-3">
            <Avatar user={{ id: lead.id, initials: lead.name.split(" ").map((s) => s[0]).join("").slice(0, 2), name: lead.name }} size={48} />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-[var(--color-ink)] truncate">
                {lead.name}
              </p>
              <p className="text-[12.5px] text-[var(--color-ink-muted)]">
                Lead · {lead.id}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-2.5 text-[13px]">
            <Row icon={<IconMail size={14} />} label="Email">
              <a className="text-[var(--color-brand-700)] hover:underline truncate" href={`mailto:${lead.email}`}>
                {lead.email}
              </a>
            </Row>
            <Row icon={<IconPhone size={14} />} label="Phone">
              {lead.phone}
            </Row>
            <Row icon={<IconMapPin size={14} />} label="Location">
              {lead.city}
            </Row>
            <Row icon={<IconCalendar size={14} />} label="Created">
              {lead.created}
            </Row>
          </div>

          <div className="border-t border-[var(--color-line)] my-5" />

          <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-3">
            Assigned to
          </p>
          <AvatarWithName user={lead.assigned} size={26} />

          {lead.tags.length > 0 && (
            <>
              <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mt-5 mb-2">
                Tags
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {lead.tags.map((t) => (
                  <Badge key={t.label} tone={t.tone}>
                    {t.label}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Main content */}
        <div className="xl:col-span-2">
          <Card padded={false}>
            <Tabs
              className="px-5"
              items={[
                {
                  key: "overview",
                  label: "Overview",
                  content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-5 px-5">
                      <Info label="Budget" value={lead.budget ?? "—"} />
                      <Info label="Interest" value={lead.interest ?? "—"} />
                      <Info label="Preferred areas" value={lead.preferredAreas?.join(", ") ?? "—"} />
                      <Info label="Language" value={lead.language ?? "—"} />
                    </div>
                  ),
                },
                {
                  key: "opps",
                  label: "Opportunities",
                  count: relatedOpps.length,
                  content: (
                    <div className="px-5 pb-5">
                      {relatedOpps.length === 0 ? (
                        <StateView
                          variant="empty"
                          compact
                          title="No opportunities linked"
                          description="When this lead is qualified for a property, an opportunity will appear here."
                          primaryAction={{ label: "Create opportunity" }}
                        />
                      ) : (
                        <div className="space-y-2">
                          {relatedOpps.map((o) => (
                            <div
                              key={o.id}
                              className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--color-line)] hover:border-[var(--color-line-strong)]"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
                                  <IconBriefcase size={15} />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[13.5px] font-semibold text-[var(--color-ink)] truncate">
                                    {o.propertyName}
                                  </p>
                                  <p className="text-[12px] text-[var(--color-ink-muted)] tabular">
                                    {o.value} · {o.probability}%
                                  </p>
                                </div>
                              </div>
                              <Badge tone="info" size="sm">
                                {o.stage}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  key: "acts",
                  label: "Activities",
                  count: relatedActivities.length,
                  content: (
                    <div className="px-5 pb-5">
                      <ul className="space-y-3">
                        {relatedActivities.map((a) => (
                          <li
                            key={a.id}
                            className="flex items-start gap-3 pb-3 border-b border-[var(--color-line)] last:border-0 last:pb-0"
                          >
                            <span className="mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--color-muted)] text-[var(--color-ink-muted)] shrink-0">
                              {a.status === "Done" ? <IconCheck size={13} /> : <IconClock size={13} />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13.5px] font-medium text-[var(--color-ink)]">
                                {a.title}
                              </p>
                              <p className="text-[12px] text-[var(--color-ink-muted)] tabular">
                                {a.dueDate}
                              </p>
                            </div>
                            <Avatar user={a.assigned} size={22} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ),
                },
                {
                  key: "notes",
                  label: "Notes",
                  content: (
                    <div className="px-5 pb-5">
                      <textarea
                        placeholder="Add a note about this lead…"
                        className="w-full min-h-[120px] rounded-lg border border-[var(--color-line)] p-3 text-[13.5px] focus:outline-none focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[var(--color-brand-100)]"
                      />
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm">Cancel</Button>
                        <Button size="sm" leadingIcon={<IconNote size={13} />}>
                          Add note
                        </Button>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "files",
                  label: "Files",
                  content: (
                    <div className="px-5 pb-5">
                      <StateView
                        variant="empty"
                        compact
                        title="No files yet"
                        description="Documents attached to this lead will appear here. File uploads come online in a later phase."
                        primaryAction={{ label: "Upload file" }}
                      />
                    </div>
                  ),
                },
              ]}
            />
          </Card>

          {/* Recent activity timeline preview */}
          <Card className="mt-4">
            <CardHeader
              title="Recent activity"
              action={
                <a
                  href="#"
                  className="text-[12.5px] font-medium text-[var(--color-brand-700)] inline-flex items-center gap-1 hover:underline"
                >
                  View all <IconExternalLink size={11} />
                </a>
              }
            />
            <Timeline
              items={relatedActivities.map((activity) => ({
                id: activity.id,
                title: activity.title,
                subtitle: `${activity.dueDate} · by ${activity.assigned.name}`,
              }))}
            />
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-[var(--color-ink-muted)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-faint)] font-semibold">
          {label}
        </p>
        <p className="text-[13px] text-[var(--color-ink)] truncate">
          {children}
        </p>
      </div>
    </div>
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
