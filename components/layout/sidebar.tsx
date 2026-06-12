"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/pipeline", label: "Pipeline", Icon: IconPipeline },
  { href: "/leads", label: "Leads", Icon: IconLeads },
  { href: "/properties", label: "Properties", Icon: IconProperties },
  { href: "/activities", label: "Activities", Icon: IconActivities },
  { href: "/dripping", label: "Dripping", Icon: IconDripping },
  { href: "/settings", label: "Settings", Icon: IconSettings },
];

export function Sidebar({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const activeWs = workspaces[0];

  return (
    <aside
      className={cn(
        "flex flex-col bg-white border-r border-[var(--color-line)] h-full",
        collapsed ? "w-[68px]" : "w-[244px]",
      )}
    >
      {/* Brand */}
      <Link
        href="/dashboard"
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

      {/* Workspace selector */}
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

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, Icon }) => {
          const isActive =
            pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
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

      {/* Footer hint */}
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
