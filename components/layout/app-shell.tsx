"use client";

import { Suspense, useState, type ReactNode } from "react";

import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { ProjectFilter } from "@/components/layout/project-filter";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceShell } from "@/components/layout/workspace-shell-context";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { permissionDenied } = useWorkspaceShell();

  return (
    <div className="min-h-screen flex bg-[var(--color-canvas)]">
      <div className="hidden lg:block shrink-0">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </div>

      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex-1 min-w-0">
          {permissionDenied ? (
            <PermissionDenied
              title="Permission denied"
              description="You do not have access to this module in this workspace."
            />
          ) : (
            children
          )}
        </main>
      </div>

      <FeedbackWidget />
    </div>
  );
}
