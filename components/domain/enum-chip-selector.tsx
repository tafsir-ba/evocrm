"use client";

import { cn } from "@/lib/utils";

export type EnumChipOption<T extends string> = {
  value: T;
  label: string;
};

export type EnumChipSelectorProps<T extends string> = {
  options: EnumChipOption<T>[];
  selectedValues: T[];
  onToggle: (value: T) => void;
  readOnly?: boolean;
  className?: string;
};

export function EnumChipSelector<T extends string>({
  options,
  selectedValues,
  onToggle,
  readOnly = false,
  className,
}: EnumChipSelectorProps<T>) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const selected = selectedValues.includes(option.value);

        return (
          <button
            key={option.value}
            type="button"
            disabled={readOnly}
            onClick={() => onToggle(option.value)}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
              readOnly ? "cursor-default" : "cursor-pointer hover:opacity-90 focus-ring",
              selected
                ? "border-[var(--color-brand-600)] bg-[var(--color-brand-50)] text-[var(--color-brand-700)]"
                : "border-[var(--color-line)] bg-white text-[var(--color-ink-soft)]",
            )}
            aria-pressed={selected}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
