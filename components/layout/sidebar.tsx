"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useWorkspaceShell } from "@/components/layout/workspace-shell-context";
import {
  IconActivities,
  IconChevronDown,
  IconDashboard,
  IconDripping,
  IconLeads,
  IconLogo,
  IconPipeline,
  IconProjects,
  IconProperties,
  IconSettings,
  IconShield,
} from "@/lib/icons";
import { workspaceNavPath } from "@/lib/workspace-paths";
import type { V1NavSegment } from "@/lib/v1-navigation";
import { cn } from "@/lib/utils";

const NAV_ICONS = {
  dashboard: IconDashboard,
  projects: IconProjects,
  pipeline: IconPipeline,
  leads: IconLeads,
  properties: IconProperties,
  activities: IconActivities,
  dripping: IconDripping,
  settings: IconSettings,
} as const;

export function Sidebar({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const { workspace, navigation, workspaces, isPlatformAdmin } = useWorkspaceShell();

  return (
    <aside
      className={cn(
        "flex flex-col bg-white border-r border-[var(--color-line)] h-full",
        collapsed ? "w-[68px]" : "w-[244px]",
      )}
    >
      <Link
        href={workspaceNavPath(workspace.slug, "dashboard")}
        onClick={onNavigate}
        className="flex items-center gap-2.5 h-[60px] px-4 border-b border-[var(--color-line)] focus-ring"
      >
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white"
          style={{ background: "var(--color-brand-600)" }}
        >
          <IconLogo size={18} />
        </span>
        {!collapsed && (
          <span className="flex flex-col leading-tight">
            <span className="text-[14.5px] font-bold tracking-tight text-[var(--color-ink)]">
              EvoHome
            </span>
            <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
              CRM
            </span>
          </span>
        )}
      </Link>

      {!collapsed && (
        <div className="mx-3 mt-3 mb-2 relative group">
          <Link
            href="/workspaces"
            onClick={onNavigate}
            className="w-full px-2.5 py-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] flex items-center gap-2 text-left hover:bg-white transition-colors focus-ring"
          >
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #1e3a8a, #2563eb)" }}
            >
              {workspace.initials}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12.5px] font-semibold truncate text-[var(--color-ink)]">
                {workspace.name}
              </span>
              <span className="block text-[11px] text-[var(--color-ink-faint)] truncate">
                {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}
              </span>
            </span>
            <IconChevronDown size={14} className="text-[var(--color-ink-muted)]" />
          </Link>
        </div>
      )}

      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto" aria-label="Primary">
        {navigation.map(({ segment, label, href }) => {
          const Icon = NAV_ICONS[segment as V1NavSegment];
          const isActive =
            pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <Link
              key={segment}
              href={href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13.5px] font-medium transition-colors focus-ring",
                isActive
                  ? "bg-[var(--color-brand-50)] text-[var(--color-brand-700)]"
                  : "text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]",
                collapsed && "justify-center",
              )}
              title={collapsed ? label : undefined}
            >
              <Icon
                size={17}
                className={cn(
                  "shrink-0",
                  isActive
                    ? "text-[var(--color-brand-600)]"
                    : "text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink-soft)]",
                )}
              />
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--color-brand-600)]" />
              )}
            </Link>
          );
        })}
      </nav>

      {isPlatformAdmin && (
        <div className="px-2 py-2 border-t border-[var(--color-line)]">
          {!collapsed && (
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
              Platform
            </p>
          )}
          <Link
            href="/admin"
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13.5px] font-medium transition-colors focus-ring",
              pathname?.startsWith("/admin")
                ? "bg-[var(--color-brand-50)] text-[var(--color-brand-700)]"
                : "text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]",
              collapsed && "justify-center",
            )}
            title={collapsed ? "Platform admin" : undefined}
          >
            <IconShield
              size={17}
              className={cn(
                "shrink-0",
                pathname?.startsWith("/admin")
                  ? "text-[var(--color-brand-600)]"
                  : "text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink-soft)]",
              )}
            />
            {!collapsed && <span className="truncate">Platform admin</span>}
          </Link>
        </div>
      )}
    </aside>
  );
}
