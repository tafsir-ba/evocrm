import Link from "next/link";

import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/domain/status-badge";
import { AvatarWithName } from "@/components/ui/avatar";
import {
  IconBuilding,
  IconCreditCard,
  IconChevronRight,
  IconFolder,
  IconHash,
  IconShieldUser,
  IconTag,
  IconUser,
} from "@/lib/icons";
import {
  settingsDictionaries,
  settingsProjects,
  settingsRoles,
  settingsTags,
  settingsUsers,
  workspaces,
} from "@/lib/mock-data";

type Params = Promise<{ workspaceSlug: string }>;

export const metadata = { title: "Settings — EvoHome CRM" };

const SECTIONS = [
  { key: "workspace", label: "Workspace", desc: "Name, locale, currency and branding", Icon: IconBuilding },
  { key: "users", label: "Users", desc: "Members, invitations and access", Icon: IconUser },
  { key: "roles", label: "Roles", desc: "Permission policies and capabilities", Icon: IconShieldUser },
  { key: "dictionaries", label: "Dictionaries", desc: "Statuses, sources, activity types", Icon: IconHash },
  { key: "tags", label: "Tags", desc: "Reusable labels for leads and properties", Icon: IconTag },
  { key: "projects", label: "Projects", desc: "Lightweight property groupings", Icon: IconFolder },
  { key: "billing", label: "Billing", desc: "Plan, invoices and payment method", Icon: IconCreditCard },
];

export default async function SettingsPage({ params }: { params: Params }) {
  const { workspaceSlug } = await params;
  const workspace =
    workspaces.find((item) => item.slug === workspaceSlug) ?? workspaces[0];

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        description="Configure your workspace, dictionaries and team. Reports, integrations and advanced billing arrive in later phases."
      />

      {/* Section grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {SECTIONS.map(({ key, label, desc, Icon }) => (
          <Link
            key={key}
            href={`#${key}`}
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

      {/* Workspace */}
      <SectionAnchor id="workspace" title="Workspace">
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Info label="Workspace name" value={workspace.name} />
            <Info label="Slug" value={workspace.slug} />
            <Info label="Default currency" value="CHF" />
            <Info label="Default locale" value="English (Switzerland)" />
            <Info label="Time zone" value="Europe/Zurich" />
            <Info label="Plan" value="Growth · monthly" />
          </div>
        </Card>
      </SectionAnchor>

      {/* Users */}
      <SectionAnchor
        id="users"
        title="Users"
        action={<Button size="sm">Invite member</Button>}
      >
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] bg-[var(--color-canvas)] border-b border-[var(--color-line)]">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Name</th>
                  <th className="text-left font-semibold px-2 py-3">Email</th>
                  <th className="text-left font-semibold px-2 py-3">Role</th>
                  <th className="text-left font-semibold px-2 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {settingsUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--color-canvas)]">
                    <td className="px-5 py-3">
                      <AvatarWithName user={{ id: u.id, name: u.name, initials: u.name.split(" ").map((s) => s[0]).join("") }} size={26} />
                    </td>
                    <td className="px-2 py-3 text-[var(--color-ink-soft)]">{u.email}</td>
                    <td className="px-2 py-3">
                      <Badge tone={u.role === "Admin" ? "info" : "muted"} size="sm">
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-2 py-3">
                      <StatusBadge status={u.status === "Invited" ? "Pending" : "Active"} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </SectionAnchor>

      {/* Roles */}
      <SectionAnchor id="roles" title="Roles" description="Permission profiles assignable to users.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {settingsRoles.map((r) => (
            <Card key={r.id} className="!p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[14px] font-semibold text-[var(--color-ink)]">{r.name}</p>
                <Badge tone="muted" size="sm">{r.members} member{r.members !== 1 ? "s" : ""}</Badge>
              </div>
              <p className="text-[12.5px] text-[var(--color-ink-muted)] leading-relaxed">
                {r.desc}
              </p>
            </Card>
          ))}
        </div>
      </SectionAnchor>

      {/* Dictionaries */}
      <SectionAnchor id="dictionaries" title="Dictionaries" description="Editable lookup lists used across the product.">
        <Card padded={false}>
          <ul className="divide-y divide-[var(--color-line)]">
            {settingsDictionaries.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[var(--color-canvas)]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-muted)] text-[var(--color-ink-muted)]">
                    <IconHash size={14} />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-medium text-[var(--color-ink)]">{d.name}</p>
                    <p className="text-[12px] text-[var(--color-ink-muted)] tabular">{d.count} entries</p>
                  </div>
                </div>
                <Button size="sm" variant="secondary">Manage</Button>
              </li>
            ))}
          </ul>
        </Card>
      </SectionAnchor>

      {/* Tags */}
      <SectionAnchor id="tags" title="Tags">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            {settingsTags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-line)] bg-white"
              >
                <Badge tone={t.tone} size="sm">{t.name}</Badge>
                <span className="text-[11.5px] text-[var(--color-ink-muted)] tabular">{t.used} used</span>
              </span>
            ))}
            <Button size="sm" variant="outline">+ Add tag</Button>
          </div>
        </Card>
      </SectionAnchor>

      {/* Projects */}
      <SectionAnchor id="projects" title="Projects" description="Lightweight property groupings managed in Settings.">
        <Card padded={false}>
          <ul className="divide-y divide-[var(--color-line)]">
            {settingsProjects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[var(--color-canvas)]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
                    <IconFolder size={14} />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-medium text-[var(--color-ink)]">{p.name}</p>
                    <p className="text-[12px] text-[var(--color-ink-muted)]">{p.city} · {p.properties} properties</p>
                  </div>
                </div>
                <Badge tone="info" size="sm">Active</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </SectionAnchor>

      {/* Billing */}
      <SectionAnchor id="billing" title="Billing">
        <Card>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[14px] font-semibold text-[var(--color-ink)]">
                Growth plan · monthly
              </p>
              <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-0.5">
                Next invoice on Jun 30, 2024 · CHF 248.00
              </p>
            </div>
            <Button variant="secondary" size="sm">Manage subscription</Button>
          </div>
          <div className="border-t border-[var(--color-line)] my-4" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Info label="Payment method" value="Visa •••• 4242" />
            <Info label="Billing email" value="finance@evohome.example" />
            <Info label="Currency" value="CHF" />
          </div>
        </Card>
      </SectionAnchor>

    </PageContainer>
  );
}

function SectionAnchor({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 mt-8 first:mt-0">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)] tracking-tight">
            {title}
          </h2>
          {description && (
            <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-0.5">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
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
