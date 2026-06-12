import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import type { StatusTone } from "@/lib/mock-data";

const TONES: Record<StatusTone, string> = {
  neutral:
    "bg-[var(--color-neutral-bg)] text-[var(--color-neutral-fg)] border-[var(--color-neutral-border)]",
  info: "bg-[var(--color-info-bg)] text-[var(--color-info-fg)] border-[var(--color-info-border)]",
  success:
    "bg-[var(--color-success-bg)] text-[var(--color-success-fg)] border-[var(--color-success-border)]",
  warn: "bg-[var(--color-warn-bg)] text-[var(--color-warn-fg)] border-[var(--color-warn-border)]",
  danger:
    "bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] border-[var(--color-danger-border)]",
  muted:
    "bg-[var(--color-muted)] text-[var(--color-ink-muted)] border-[var(--color-line)]",
};

export function Badge({
  tone = "neutral",
  children,
  dot,
  className,
  size = "md",
}: {
  tone?: StatusTone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium border rounded-full whitespace-nowrap",
        size === "sm" ? "text-[11px] px-2 py-[2px]" : "text-[12px] px-2.5 py-[3px]",
        TONES[tone],
        className,
      )}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "currentColor" }}
        />
      )}
      {children}
    </span>
  );
}

/** Status-aware badge: maps a domain string to a tone */
const STATUS_MAP: Record<string, StatusTone> = {
  // Leads
  New: "info",
  Contacted: "warn",
  Qualified: "success",
  Lost: "muted",
  // Properties
  Available: "success",
  Reserved: "warn",
  Sold: "danger",
  "Off-market": "muted",
  // Activities
  Upcoming: "info",
  Done: "success",
  Pending: "warn",
  Overdue: "danger",
  // Campaigns
  Active: "success",
  Scheduled: "info",
  Paused: "warn",
  Draft: "muted",
};

export function StatusBadge({
  status,
  size = "md",
}: {
  status: string;
  size?: "sm" | "md";
}) {
  const tone = STATUS_MAP[status] ?? "neutral";
  return (
    <Badge tone={tone} dot size={size}>
      {status}
    </Badge>
  );
}
