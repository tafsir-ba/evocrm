import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
};

export function Card({ className, padded = true, children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        "bg-white border border-[var(--color-line)] rounded-xl shadow-[var(--shadow-xs)]",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  density = "comfortable",
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  density?: "comfortable" | "compact";
  className?: string;
}) {
  const compact = density === "compact";
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3",
        compact ? "mb-2" : "mb-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h3
          className={cn(
            "font-semibold text-[var(--color-ink)] tracking-tight",
            compact ? "text-[13px]" : "text-[15px]",
          )}
        >
          {title}
        </h3>
        {subtitle && (
          <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
