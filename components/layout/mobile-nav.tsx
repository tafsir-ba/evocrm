"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { IconClose } from "@/lib/icons";

export function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close navigation"
      />
      <div className="relative h-full w-[260px] bg-white animate-[slideIn_.18s_ease-out]">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-[var(--color-muted)] focus-ring"
          aria-label="Close"
        >
          <IconClose size={16} />
        </button>
        <Sidebar onNavigate={onClose} />
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
