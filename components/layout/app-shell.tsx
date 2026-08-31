"use client";

import { useState, type ReactNode } from "react";

import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { useWorkspaceShell } from "@/components/layout/workspace-shell-context";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { permissionDenied } = useWorkspaceShell();

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--color-canvas)]">
      <div className="hidden h-full shrink-0 lg:block">
        <Sidebar />
      </div>

      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
        <main
          data-testid="workspace-main"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto"
        >
          {permissionDenied ? (
            <PermissionDenied
              title="Permission denied"
              description="You do not have access to this module in this workspace."
            />
          ) : (
            children
          )}
        </main>
        <FeedbackWidget />
      </div>
    </div>
  );
}
