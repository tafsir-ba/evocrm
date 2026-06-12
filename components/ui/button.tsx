import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
};

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)] active:bg-[var(--color-brand-800)] shadow-[var(--shadow-xs)]",
  secondary:
    "bg-white text-[var(--color-ink)] border border-[var(--color-line)] hover:bg-[var(--color-canvas)] hover:border-[var(--color-line-strong)]",
  outline:
    "bg-transparent text-[var(--color-brand-700)] border border-[var(--color-brand-200)] hover:bg-[var(--color-brand-50)]",
  ghost:
    "bg-transparent text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]",
  danger:
    "bg-[#dc2626] text-white hover:bg-[#b91c1c] shadow-[var(--shadow-xs)]",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-[13.5px] gap-2 rounded-md",
  lg: "h-10 px-4 text-sm gap-2 rounded-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  leadingIcon,
  trailingIcon,
  loading,
  fullWidth,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-150 focus-ring select-none",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
    >
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        leadingIcon
      )}
      {children}
      {!loading && trailingIcon}
    </button>
  );
}
