import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, ReactNode } from "react";
export { Textarea } from "@/components/ui/textarea";
export { Select } from "@/components/ui/select";

const baseField =
  "w-full bg-white border border-[var(--color-line)] rounded-md text-[13.5px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] " +
  "focus:outline-none focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[var(--color-brand-100)] " +
  "transition-colors hover:border-[var(--color-line-strong)]";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  invalid?: boolean;
  fieldSize?: "sm" | "md";
};

export function Input({
  leadingIcon,
  trailingIcon,
  invalid,
  fieldSize = "md",
  className,
  ...rest
}: InputProps) {
  const h = fieldSize === "sm" ? "h-8" : "h-10";
  return (
    <div className={cn("relative", className)}>
      {leadingIcon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] pointer-events-none">
          {leadingIcon}
        </div>
      )}
      <input
        {...rest}
        className={cn(
          baseField,
          h,
          leadingIcon ? "pl-9" : "pl-3",
          trailingIcon ? "pr-9" : "pr-3",
          invalid &&
            "border-[var(--color-danger-fg)] focus:border-[var(--color-danger-fg)] focus:ring-[var(--color-danger-border)]",
        )}
      />
      {trailingIcon && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]">
          {trailingIcon}
        </div>
      )}
    </div>
  );
}

export function Label({
  htmlFor,
  children,
  required,
  hint,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
  hint?: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[13px] font-medium text-[var(--color-ink-soft)] flex items-center justify-between"
    >
      <span>
        {children}
        {required && <span className="text-[var(--color-danger-fg)] ml-1">*</span>}
      </span>
      {hint && <span className="text-[12px] text-[var(--color-ink-faint)]">{hint}</span>}
    </label>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-[12.5px] text-[var(--color-danger-fg)] mt-1.5">{children}</p>
  );
}
