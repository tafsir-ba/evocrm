import Link from "next/link";

import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  IconBuilding,
  IconCreditCard,
  IconChevronRight,
  IconFolder,
  IconHash,
  IconMail,
  IconPlug,
  IconShieldUser,
  IconTag,
  IconUser,
} from "@/lib/icons";
import { hasPermission } from "@/server/permissions/permissions";
import { listDictionariesForWorkspace } from "@/server/services/dictionaries";
import { listProjectsForWorkspace } from "@/server/services/projects";
import { listTagsForWorkspace } from "@/server/services/tags";
import { requireWorkspacePageAccess } from "@/server/workspaces/require-workspace-page-access";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Settings — EvoHome CRM" };

export default async function SettingsPage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const access = await requireWorkspacePageAccess(workspaceSlug);
  const workspace = access.context.workspace;
  const permissions = access.context.membership.role.permissions;
  const canBilling = hasPermission(permissions, "billing:manage");

  const dictionaries = access.permissionDenied
    ? []
    : await listDictionariesForWorkspace(workspace.id);
  const tags = access.permissionDenied
    ? []
    : await listTagsForWorkspace(workspace.id);
  const projects = access.permissionDenied
    ? []
    : await listProjectsForWorkspace(workspace.id);

  const sections = [
    {
      key: "workspace",
      label: "Workspace",
      desc: "Name, locale, currency and branding",
      Icon: IconBuilding,
      href: "workspace",
      visible: true,
    },
    {
      key: "users",
      label: "Users",
      desc: "Members, invitations and access",
      Icon: IconUser,
      href: "users",
      visible: true,
    },
    {
      key: "roles",
      label: "Roles",
      desc: "Permission policies and capabilities",
      Icon: IconShieldUser,
      href: "roles",
      visible: true,
    },
    {
      key: "dictionaries",
      label: "Dictionaries",
      desc: "Statuses, sources, activity types",
      Icon: IconHash,
      href: "dictionaries",
      visible: true,
    },
    {
      key: "tags",
      label: "Tags",
      desc: "Reusable labels for leads and properties",
      Icon: IconTag,
      href: "tags",
      visible: true,
    },
    {
      key: "projects",
      label: "Projects",
      desc: "Lightweight property groupings",
      Icon: IconFolder,
      href: "projects",
      visible: true,
    },
    {
      key: "billing",
      label: "Billing",
      desc: "Plan, invoices and payment method",
      Icon: IconCreditCard,
      href: "billing",
      visible: canBilling,
    },
    {
      key: "integrations",
      label: "Integrations",
      desc: "Website lead capture and external connections",
      Icon: IconPlug,
      href: "integrations",
      visible: true,
    },
    {
      key: "sending-domains",
      label: "Sending Domains",
      desc: "Verify domains for campaign email sending",
      Icon: IconMail,
      href: "sending-domains",
      visible: true,
    },
  ].filter((section) => section.visible);

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        description="Configure your workspace, team, dictionaries, integrations and billing."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {sections.map(({ key, label, desc, Icon, href }) => (
          <Link
            key={key}
            href={`/w/${workspaceSlug}/settings/${href}`}
            className="group rounded-xl border border-[var(--color-line)] bg-white p-4 hover:border-[var(--color-brand-300)] hover:shadow-[var(--shadow-sm)] transition-all flex items-start gap-3 focus-ring"
          >
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--color-brand-50)] text-[var(--color-brand-600)] shrink-0">
              <Icon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-[var(--color-ink)] tracking-tight">
                {label}
              </p>
              <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-0.5 leading-snug">
                {desc}
              </p>
            </div>
            <IconChevronRight
              size={14}
              className="text-[var(--color-ink-faint)] group-hover:text-[var(--color-brand-600)] mt-1.5 shrink-0"
            />
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--color-ink)] tracking-tight">
              Workspace overview
            </h2>
            <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-0.5">
              Quick snapshot — manage details in Workspace settings.
            </p>
          </div>
          <Link href={`/w/${workspaceSlug}/settings/workspace`}>
            <Button size="sm">Manage</Button>
          </Link>
        </div>
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Info label="Workspace name" value={workspace.name} />
            <Info label="Slug" value={workspace.slug} />
            <Info label="Default currency" value={workspace.defaultCurrency} />
            <Info label="Time zone" value={workspace.timezone} />
          </div>
        </Card>
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3 mb-3">
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)] tracking-tight">
            Dictionaries
          </h2>
          <Link href={`/w/${workspaceSlug}/settings/dictionaries`}>
            <Button size="sm">Manage</Button>
          </Link>
        </div>
        <Card padded={false}>
          <ul className="divide-y divide-[var(--color-line)]">
            {dictionaries.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[var(--color-canvas)]"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-muted)] text-[var(--color-ink-muted)]">
                    <IconHash size={14} />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-medium text-[var(--color-ink)]">{d.name}</p>
                    <p className="text-[12px] text-[var(--color-ink-muted)] tabular">
                      {d.itemCount} entries
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3 mb-3">
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)] tracking-tight">Tags</h2>
          <Link href={`/w/${workspaceSlug}/settings/tags`}>
            <Button size="sm">Manage</Button>
          </Link>
        </div>
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((t) => (
              <Badge key={t.id} tone="muted" size="sm">
                {t.name}
              </Badge>
            ))}
            {tags.length === 0 && (
              <p className="text-[12.5px] text-[var(--color-ink-muted)]">No tags yet.</p>
            )}
          </div>
        </Card>
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3 mb-3">
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)] tracking-tight">
            Projects
          </h2>
          <Link href={`/w/${workspaceSlug}/settings/projects`}>
            <Button size="sm">Manage</Button>
          </Link>
        </div>
        <Card padded={false}>
          <ul className="divide-y divide-[var(--color-line)]">
            {projects.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[var(--color-canvas)]"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
                    <IconFolder size={14} />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-medium text-[var(--color-ink)]">{p.name}</p>
                    <p className="text-[12px] text-[var(--color-ink-muted)]">
                      {[p.city, p.country].filter(Boolean).join(" · ") || "No location"}
                    </p>
                  </div>
                </div>
                <Badge tone={p.archivedAt ? "muted" : "info"} size="sm">
                  {p.archivedAt ? "Archived" : "Active"}
                </Badge>
              </li>
            ))}
            {projects.length === 0 && (
              <li className="px-5 py-4 text-[12.5px] text-[var(--color-ink-muted)]">
                No projects yet.
              </li>
            )}
          </ul>
        </Card>
      </section>
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
