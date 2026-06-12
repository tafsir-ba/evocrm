import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/domain/status-badge";
import { AvatarWithName } from "@/components/ui/avatar";
import { FilterBar } from "@/components/domain/filter-bar";
import { Tabs } from "@/components/ui/tabs";
import {
  IconPlus,
  IconCheck,
  IconMail,
  IconCalendar,
  IconMapPin,
  IconNote,
  IconPhone,
  IconActivities,
} from "@/lib/icons";
import { activities } from "@/lib/mock-data";
import type { ActivityType } from "@/lib/mock-data";

export const metadata = { title: "Activities — EvoHome CRM" };

const TYPE_ICONS: Record<ActivityType, React.ReactNode> = {
  Call: <IconPhone size={14} />,
  Email: <IconMail size={14} />,
  Meeting: <IconCalendar size={14} />,
  Visit: <IconMapPin size={14} />,
  Task: <IconCheck size={14} />,
  Note: <IconNote size={14} />,
};

const TYPE_COLORS: Record<ActivityType, string> = {
  Call: "var(--color-info-fg)",
  Email: "var(--color-brand-600)",
  Meeting: "#9333ea",
  Visit: "#7c3aed",
  Task: "var(--color-warn-fg)",
  Note: "var(--color-ink-muted)",
};

export default function ActivitiesPage() {
  const upcoming = activities.filter((a) => a.status === "Upcoming");
  const overdue = activities.filter((a) => a.status === "Overdue");
  const done = activities.filter((a) => a.status === "Done");

  return (
    <PageContainer>
      <PageHeader
        title="Activities"
        description="Calls, emails, meetings, visits, tasks and notes — your daily follow-up board."
        meta={
          <Badge tone="muted" size="sm">
            {activities.length} total
          </Badge>
        }
        actions={<Button leadingIcon={<IconPlus size={14} />}>New activity</Button>}
      />

      <div className="mb-4">
        <FilterBar
          search
          searchPlaceholder="Search activities…"
          selects={[
            { label: "All types", options: ["Call", "Email", "Meeting", "Visit", "Task", "Note"] },
            { label: "All statuses", options: ["Upcoming", "Done", "Pending", "Overdue"] },
            { label: "All assignees", options: ["John Doe", "Jane Roe", "Marc Berger"] },
          ]}
        />
      </div>

      <Tabs
        items={[
          {
            key: "all",
            label: "All",
            count: activities.length,
            content: <ActivityList list={activities} />,
          },
          {
            key: "mine",
            label: "Mine",
            count: activities.filter((a) => a.assigned.id === "u1").length,
            content: (
              <ActivityList
                list={activities.filter((a) => a.assigned.id === "u1")}
              />
            ),
          },
          {
            key: "upcoming",
            label: "Upcoming",
            count: upcoming.length,
            content: <ActivityList list={upcoming} />,
          },
          {
            key: "overdue",
            label: "Overdue",
            count: overdue.length,
            content: <ActivityList list={overdue} />,
          },
          {
            key: "done",
            label: "Done",
            count: done.length,
            content: <ActivityList list={done} />,
          },
        ]}
      />
    </PageContainer>
  );

  function ActivityList({ list }: { list: typeof activities }) {
    if (list.length === 0) {
      return (
        <div className="bg-white border border-dashed border-[var(--color-line-strong)] rounded-xl py-12 text-center dot-grid">
          <span className="inline-flex w-12 h-12 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-600)] mb-3">
            <IconActivities size={20} />
          </span>
          <p className="text-[14.5px] font-semibold text-[var(--color-ink)]">
            All caught up
          </p>
          <p className="text-[13px] text-[var(--color-ink-muted)] mt-1">
            No activities match this view.
          </p>
        </div>
      );
    }
    return (
      <div className="bg-white border border-[var(--color-line)] rounded-xl divide-y divide-[var(--color-line)] overflow-hidden">
        {list.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--color-canvas)] transition-colors"
          >
            <span
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
              style={{
                background: `color-mix(in srgb, ${TYPE_COLORS[a.type]} 10%, white)`,
                color: TYPE_COLORS[a.type],
              }}
              title={a.type}
            >
              {TYPE_ICONS[a.type]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13.5px] font-semibold text-[var(--color-ink)] truncate">
                  {a.title}
                </p>
                <Badge tone="muted" size="sm">
                  {a.type}
                </Badge>
              </div>
              <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5 truncate">
                {a.related} · {a.dueDate}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <AvatarWithName user={a.assigned} size={22} subtle />
            </div>
            <StatusBadge status={a.status} size="sm" />
          </div>
        ))}
      </div>
    );
  }
}
