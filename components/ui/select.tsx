import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  fieldSize?: "sm" | "md";
};

const baseField =
  "w-full bg-white border border-[var(--color-line)] rounded-md text-[13.5px] text-[var(--color-ink)] " +
  "focus:outline-none focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[var(--color-brand-100)] " +
  "transition-colors hover:border-[var(--color-line-strong)]";

export function Select({
  className,
  fieldSize = "md",
  children,
  ...rest
}: SelectProps) {
  const h = fieldSize === "sm" ? "h-8" : "h-10";
  return (
    <select
      {...rest}
      className={cn(
        baseField,
        h,
        "appearance-none pr-9 pl-3 bg-no-repeat",
        "bg-[length:14px_14px] bg-[right_0.65rem_center]",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")",
      }}
    >
      {children}
    </select>
  );
}
