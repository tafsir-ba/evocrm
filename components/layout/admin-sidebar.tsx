"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PLATFORM_ADMIN_NAV } from "@/lib/platform-admin-navigation";
import { IconArrowLeft, IconInbox, IconLogo, IconShield } from "@/lib/icons";
import { cn } from "@/lib/utils";

const ADMIN_NAV_ICONS = {
  overview: IconShield,
  feedback: IconInbox,
} as const;

export function AdminSidebar({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex flex-col bg-white border-r border-[var(--color-line)] h-full",
        collapsed ? "w-[68px]" : "w-[244px]",
      )}
    >
      <Link
        href="/admin"
        onClick={onNavigate}
        className="flex items-center gap-2.5 h-[60px] px-4 border-b border-[var(--color-line)] focus-ring"
      >
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white"
          style={{ background: "var(--color-brand-600)" }}
        >
          <IconShield size={18} />
        </span>
        {!collapsed && (
          <span className="flex flex-col leading-tight">
            <span className="text-[14.5px] font-bold tracking-tight text-[var(--color-ink)]">
              Platform
            </span>
            <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
              Admin
            </span>
          </span>
        )}
      </Link>

      {!collapsed && (
        <div className="mx-3 mt-3 mb-2">
          <Link
            href="/workspaces"
            onClick={onNavigate}
            className="w-full px-2.5 py-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] flex items-center gap-2 text-left hover:bg-white transition-colors focus-ring"
          >
            <IconArrowLeft size={14} className="text-[var(--color-ink-muted)]" />
            <span className="text-[12.5px] font-medium text-[var(--color-ink-soft)]">
              Back to workspaces
            </span>
          </Link>
        </div>
      )}

      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto" aria-label="Platform admin">
        {PLATFORM_ADMIN_NAV.map(({ segment, label, href }) => {
          const Icon = ADMIN_NAV_ICONS[segment];
          const isActive =
            segment === "overview"
              ? pathname === href
              : pathname === href || pathname?.startsWith(`${href}/`);

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
        <div className="px-4 py-3 border-t border-[var(--color-line)] text-[11px] text-[var(--color-ink-faint)]">
          <span className="inline-flex items-center gap-1.5">
            <IconLogo size={12} />
            EvoHome operator console
          </span>
        </div>
      )}
    </aside>
  );
}
