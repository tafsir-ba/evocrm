import { cn } from "@/lib/utils";
import { forwardRef, type TextareaHTMLAttributes } from "react";

const baseField =
  "w-full bg-white border border-[var(--color-line)] rounded-md text-[13.5px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] " +
  "focus:outline-none focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[var(--color-brand-100)] " +
  "transition-colors hover:border-[var(--color-line-strong)]";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={cn(baseField, "py-2 px-3 min-h-[88px] leading-relaxed", className)}
    />
  );
});
