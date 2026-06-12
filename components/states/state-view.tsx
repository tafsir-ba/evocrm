import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  IconAlert,
  IconInbox,
  IconShield,
  IconSearch,
} from "@/lib/icons";

type Variant = "empty" | "error" | "forbidden" | "notfound" | "noworkspace";

const VARIANT_CONFIG: Record<
  Variant,
  { Icon: typeof IconInbox; iconBg: string; iconFg: string }
> = {
  empty: {
    Icon: IconInbox,
    iconBg: "var(--color-brand-50)",
    iconFg: "var(--color-brand-600)",
  },
  error: {
    Icon: IconAlert,
    iconBg: "var(--color-danger-bg)",
    iconFg: "var(--color-danger-fg)",
  },
  forbidden: {
    Icon: IconShield,
    iconBg: "var(--color-warn-bg)",
    iconFg: "var(--color-warn-fg)",
  },
  notfound: {
    Icon: IconSearch,
    iconBg: "var(--color-muted)",
    iconFg: "var(--color-ink-muted)",
  },
  noworkspace: {
    Icon: IconShield,
    iconBg: "var(--color-info-bg)",
    iconFg: "var(--color-info-fg)",
  },
};

export function StateView({
  variant = "empty",
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
  compact = false,
  framed = true,
}: {
  variant?: Variant;
  title: ReactNode;
  description?: ReactNode;
  primaryAction?: { label: string; onClick?: () => void };
  secondaryAction?: { label: string; onClick?: () => void };
  className?: string;
  compact?: boolean;
  framed?: boolean;
}) {
  const { Icon, iconBg, iconFg } = VARIANT_CONFIG[variant];
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        framed &&
          "bg-white border border-dashed border-[var(--color-line-strong)] rounded-xl dot-grid",
        compact ? "py-10 px-6" : "py-16 px-8",
        className,
      )}
    >
      <span
        className="inline-flex items-center justify-center rounded-full mb-4"
        style={{
          background: iconBg,
          color: iconFg,
          width: compact ? 44 : 56,
          height: compact ? 44 : 56,
        }}
      >
        <Icon size={compact ? 20 : 24} />
      </span>
      <h3 className="text-[15.5px] font-semibold text-[var(--color-ink)] mb-1.5 tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="text-[13px] text-[var(--color-ink-muted)] max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center gap-2 mt-5">
          {primaryAction && (
            <Button onClick={primaryAction.onClick}>{primaryAction.label}</Button>
          )}
          {secondaryAction && (
            <Button variant="secondary" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
