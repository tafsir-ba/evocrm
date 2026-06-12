"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  IconActivities,
  IconChevronDown,
  IconDashboard,
  IconDripping,
  IconLeads,
  IconLogo,
  IconPipeline,
  IconProperties,
  IconSettings,
} from "@/lib/icons";
import { workspaces } from "@/lib/mock-data";
import { V1_NAV_ITEMS } from "@/lib/v1-navigation";
import { MOCK_WORKSPACE_SLUG, workspaceNavPath } from "@/lib/workspace-paths";

const NAV_ICONS = {
  dashboard: IconDashboard,
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
  const params = useParams<{ workspaceSlug?: string }>();
  const workspaceSlug = params.workspaceSlug ?? MOCK_WORKSPACE_SLUG;
  const activeWs =
    workspaces.find((workspace) => workspace.slug === workspaceSlug) ??
    workspaces[0];

  return (
    <aside
      className={cn(
        "flex flex-col bg-white border-r border-[var(--color-line)] h-full",
        collapsed ? "w-[68px]" : "w-[244px]",
      )}
    >
      <Link
        href={workspaceNavPath(workspaceSlug, "dashboard")}
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
        <button
          type="button"
          className="mx-3 mt-3 mb-2 px-2.5 py-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] flex items-center gap-2 text-left hover:bg-white transition-colors focus-ring"
        >
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #1e3a8a, #2563eb)" }}
          >
            {activeWs.initials}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[12.5px] font-semibold truncate text-[var(--color-ink)]">
              {activeWs.name}
            </span>
            <span className="block text-[11px] text-[var(--color-ink-faint)] truncate">
              Workspace
            </span>
          </span>
          <IconChevronDown size={14} className="text-[var(--color-ink-muted)]" />
        </button>
      )}

      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto" aria-label="Primary">
        {V1_NAV_ITEMS.map(({ segment, label }) => {
          const href = workspaceNavPath(workspaceSlug, segment);
          const Icon = NAV_ICONS[segment];
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

      {!collapsed && (
        <div className="px-3 pb-3 pt-2 border-t border-[var(--color-line)]">
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3">
            <p className="text-[12px] font-semibold text-[var(--color-ink)]">
              Phase 1 preview
            </p>
            <p className="text-[11.5px] text-[var(--color-ink-muted)] mt-1 leading-snug">
              All data shown is mock. Real values will load from your workspace
              dictionaries.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
