"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/layout/workspace-shell-context";
import { ProjectFilter } from "@/components/layout/project-filter";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  IconChevronDown,
  IconMenu,
  IconSearch,
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
    <header className="h-[60px] bg-white border-b border-[var(--color-line)] flex items-center gap-2 sm:gap-3 px-3 sm:px-4 lg:px-6 sticky top-0 z-30 min-w-0">
      <button
        onClick={onOpenMobileNav}
        className="lg:hidden inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-[var(--color-muted)] focus-ring"
        aria-label="Open navigation"
      >
        <IconMenu size={18} />
      </button>

      <div className="flex-1 max-w-md hidden md:block">
        <Input
          placeholder="Search leads, properties, activities…"
          leadingIcon={<IconSearch size={15} />}
          trailingIcon={<span className="kbd">⌘K</span>}
          fieldSize="sm"
        />
      </div>

      <div className="flex-1 md:hidden" />

      <Suspense fallback={null}>
        <ProjectFilter />
      </Suspense>

      <NotificationsMenu />

      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex items-center gap-2 h-9 pl-1 pr-2 rounded-md hover:bg-[var(--color-muted)] focus-ring"
        >
          <Avatar
            user={{
              id: user.id,
              name: displayName,
              initials,
            }}
            size={26}
          />
          <span className="hidden sm:inline text-[13px] font-medium text-[var(--color-ink)] max-w-[120px] truncate">
            {displayName}
          </span>
          <IconChevronDown size={14} className="text-[var(--color-ink-muted)]" />
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
                "absolute right-0 top-[44px] z-50 w-[228px] rounded-lg border border-[var(--color-line)] bg-white shadow-[var(--shadow-lg)] p-1.5",
              )}
            >
              <div className="px-2.5 py-2 border-b border-[var(--color-line)] mb-1">
                <p className="text-[13px] font-semibold text-[var(--color-ink)]">
                  {displayName}
                </p>
                <p className="text-[12px] text-[var(--color-ink-muted)] truncate">
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
