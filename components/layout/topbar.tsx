"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/layout/workspace-shell-context";
import { ProjectFilter } from "@/components/layout/project-filter";
import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { Avatar } from "@/components/ui/avatar";
import {
  IconChevronDown,
  IconMenu,
  IconLogout,
  IconUser,
  IconSettings,
  IconShield,
} from "@/lib/icons";
import { workspaceNavPath } from "@/lib/workspace-paths";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

export function Topbar({
  onOpenMobileNav,
}: {
  onOpenMobileNav?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, workspace, navigation, isPlatformAdmin } = useWorkspaceShell();
  const canAccessSettings = navigation.some((item) => item.segment === "settings");

  const displayName = user.name ?? user.email;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";

  return (
    <header className="sticky top-0 z-30 flex h-[60px] min-w-0 items-center gap-1.5 border-b border-[var(--color-line)] bg-white px-2.5 sm:gap-3 sm:px-4 lg:px-6">
      <button
        onClick={onOpenMobileNav}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-[var(--color-muted)] focus-ring lg:hidden"
        aria-label="Open navigation"
      >
        <IconMenu size={18} />
      </button>

      <Suspense fallback={<div className="h-8 min-w-0 max-w-[9.5rem] flex-1 sm:max-w-[280px]" />}>
        <ProjectFilter />
      </Suspense>

      <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
        <GlobalSearch />

        <NotificationsMenu />

        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md pl-1 pr-1.5 hover:bg-[var(--color-muted)] focus-ring sm:gap-2 sm:pr-2"
          >
            <Avatar
              user={{
                id: user.id,
                name: displayName,
                initials,
              }}
              size={26}
            />
            <span className="hidden max-w-[120px] truncate text-[13px] font-medium text-[var(--color-ink)] sm:inline">
              {displayName}
            </span>
            <IconChevronDown size={14} className="hidden text-[var(--color-ink-muted)] sm:block" />
          </button>
          {menuOpen && (
            <>
              <button
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div
                className={cn(
                  "absolute right-0 top-[44px] z-50 w-[min(228px,calc(100vw-1rem))] rounded-lg border border-[var(--color-line)] bg-white p-1.5 shadow-[var(--shadow-lg)]",
                )}
              >
                <div className="mb-1 border-b border-[var(--color-line)] px-2.5 py-2">
                  <p className="text-[13px] font-semibold text-[var(--color-ink)]">
                    {displayName}
                  </p>
                  <p className="truncate text-[12px] text-[var(--color-ink-muted)]">
                    {user.email}
                  </p>
                </div>
                <MenuItem icon={<IconUser size={15} />}>My profile</MenuItem>
                <MenuItem icon={<IconSettings size={15} />} href="/workspaces">
                  All workspaces
                </MenuItem>
                {canAccessSettings && (
                  <MenuItem
                    icon={<IconSettings size={15} />}
                    href={workspaceNavPath(workspace.slug, "settings")}
                  >
                    Workspace settings
                  </MenuItem>
                )}
                {isPlatformAdmin && (
                  <MenuItem icon={<IconShield size={15} />} href="/admin">
                    Platform admin
                  </MenuItem>
                )}
                <div className="my-1 border-t border-[var(--color-line)]" />
                <MenuItem
                  icon={<IconLogout size={15} />}
                  tone="danger"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  Sign out
                </MenuItem>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({
  icon,
  children,
  tone = "default",
  href,
  onClick,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: "default" | "danger";
  href?: string;
  onClick?: () => void;
}) {
  const className = cn(
    "w-full flex items-center gap-2 h-8 px-2.5 rounded-md text-[13px] hover:bg-[var(--color-muted)] focus-ring",
    tone === "danger"
      ? "text-[var(--color-danger-fg)]"
      : "text-[var(--color-ink-soft)]",
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {icon}
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      {children}
    </button>
  );
}
