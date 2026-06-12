"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { currentUser } from "@/lib/mock-data";
import {
  IconBell,
  IconChevronDown,
  IconMenu,
  IconSearch,
  IconLogout,
  IconUser,
  IconSettings,
} from "@/lib/icons";

export function Topbar({
  onOpenMobileNav,
}: {
  onOpenMobileNav?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="h-[60px] bg-white border-b border-[var(--color-line)] flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-30">
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

      <button
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-[var(--color-muted)] focus-ring text-[var(--color-ink-soft)]"
        aria-label="Notifications"
      >
        <IconBell size={17} />
        <span className="absolute top-1.5 right-2 w-1.5 h-1.5 bg-[var(--color-brand-600)] rounded-full" />
      </button>

      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex items-center gap-2 h-9 pl-1 pr-2 rounded-md hover:bg-[var(--color-muted)] focus-ring"
        >
          <Avatar user={currentUser} size={26} />
          <span className="hidden sm:inline text-[13px] font-medium text-[var(--color-ink)] max-w-[120px] truncate">
            {currentUser.name}
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
                  {currentUser.name}
                </p>
                <p className="text-[12px] text-[var(--color-ink-muted)] truncate">
                  {currentUser.email}
                </p>
              </div>
              <MenuItem icon={<IconUser size={15} />}>My profile</MenuItem>
              <MenuItem icon={<IconSettings size={15} />}>Workspace settings</MenuItem>
              <div className="my-1 border-t border-[var(--color-line)]" />
              <MenuItem icon={<IconLogout size={15} />} tone="danger">
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
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <button
      className={cn(
        "w-full flex items-center gap-2 h-8 px-2.5 rounded-md text-[13px] hover:bg-[var(--color-muted)] focus-ring",
        tone === "danger"
          ? "text-[var(--color-danger-fg)]"
          : "text-[var(--color-ink-soft)]",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
