"use client";

import { useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";

import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { Avatar } from "@/components/ui/avatar";
import { IconChevronDown, IconClose, IconLogout, IconMenu } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type AdminShellUser = {
  id: string;
  email: string;
  name?: string | null;
};

export function AdminShell({
  user,
  children,
}: {
  user: AdminShellUser;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = user.name ?? user.email;
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "A";

  return (
    <div className="min-h-screen flex bg-[var(--color-canvas)]">
      <div className="hidden lg:block shrink-0">
        <div className="sticky top-0 h-screen">
          <AdminSidebar />
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <div className="relative h-full w-[260px] bg-white">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-[var(--color-muted)] focus-ring"
              aria-label="Close"
            >
              <IconClose size={16} />
            </button>
            <AdminSidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-[60px] bg-white border-b border-[var(--color-line)] flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-[var(--color-muted)] focus-ring"
            aria-label="Open navigation"
          >
            <IconMenu size={18} />
          </button>
          <div className="flex-1" />
          <div className="relative">
            <button
              onClick={() => setMenuOpen((value) => !value)}
              className="inline-flex items-center gap-2 h-9 pl-1 pr-2 rounded-md hover:bg-[var(--color-muted)] focus-ring"
            >
              <Avatar user={{ id: user.id, name: displayName, initials }} size={26} />
              <span className="hidden sm:inline text-[13px] font-medium text-[var(--color-ink)] max-w-[160px] truncate">
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
                <div className="absolute right-0 top-[44px] z-50 w-[228px] rounded-lg border border-[var(--color-line)] bg-white shadow-[var(--shadow-lg)] p-1.5">
                  <div className="px-2.5 py-2 border-b border-[var(--color-line)] mb-1">
                    <p className="text-[13px] font-semibold text-[var(--color-ink)]">{displayName}</p>
                    <p className="text-[12px] text-[var(--color-ink-muted)] truncate">{user.email}</p>
                  </div>
                  <Link
                    href="/workspaces"
                    className="w-full flex items-center gap-2 h-8 px-2.5 rounded-md text-[13px] text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] focus-ring"
                  >
                    Back to workspaces
                  </Link>
                  <div className="my-1 border-t border-[var(--color-line)]" />
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className={cn(
                      "w-full flex items-center gap-2 h-8 px-2.5 rounded-md text-[13px] hover:bg-[var(--color-muted)] focus-ring",
                      "text-[var(--color-danger-fg)]",
                    )}
                  >
                    <IconLogout size={15} />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
