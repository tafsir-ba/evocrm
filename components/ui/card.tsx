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
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 mb-4", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-[var(--color-ink)] tracking-tight">
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
