"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { IconClose } from "@/lib/icons";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen flex bg-[var(--color-canvas)]">
      {/* Desktop sidebar */}
      <div className="hidden lg:block shrink-0">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <div className="relative h-full w-[260px] bg-white animate-[slideIn_.18s_ease-out]">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-[var(--color-muted)] focus-ring"
              aria-label="Close"
            >
              <IconClose size={16} />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(-12px); opacity: .4; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
