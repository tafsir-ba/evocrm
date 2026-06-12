import { cn } from "@/lib/utils";
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({
  className,
  ...rest
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table
        {...rest}
        className={cn("min-w-full text-[13px]", className)}
      />
    </div>
  );
}

export function TableHead({
  className,
  ...rest
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      {...rest}
      className={cn(
        "text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] bg-[var(--color-canvas)] border-b border-[var(--color-line)]",
        className,
      )}
    />
  );
}

export function TableBody({
  className,
  ...rest
}: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...rest} className={cn("divide-y divide-[var(--color-line)]", className)} />;
}

export function TableRow({
  className,
  ...rest
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      {...rest}
      className={cn("hover:bg-[var(--color-canvas)] transition-colors", className)}
    />
  );
}

export function TableHeaderCell({
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      className={cn("text-left font-semibold px-4 py-3", className)}
    />
  );
}

export function TableCell({
  className,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...rest} className={cn("px-4 py-3 align-middle", className)} />;
}
