"use client";

import { createContext, useContext, type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type TableDensity = "comfortable" | "compact";

const TableDensityContext = createContext<TableDensity>("comfortable");

export function Table({
  className,
  density = "comfortable",
  ...rest
}: HTMLAttributes<HTMLTableElement> & { density?: TableDensity }) {
  return (
    <TableDensityContext.Provider value={density}>
      <div className="overflow-x-auto">
        <table
          {...rest}
          className={cn(
            "min-w-full",
            density === "compact" ? "text-[12.5px] leading-none" : "text-[13px]",
            className,
          )}
        />
      </div>
    </TableDensityContext.Provider>
  );
}

export function TableHead({
  className,
  ...rest
}: HTMLAttributes<HTMLTableSectionElement>) {
  const density = useContext(TableDensityContext);
  return (
    <thead
      {...rest}
      className={cn(
        "border-b border-[var(--color-line)] bg-[var(--color-canvas)] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]",
        density === "compact" ? "text-[10.5px]" : "text-[11.5px]",
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
  const density = useContext(TableDensityContext);
  return (
    <th
      {...rest}
      className={cn(
        "text-left font-semibold",
        density === "compact" ? "px-1.5 py-1" : "px-4 py-3",
        className,
      )}
    />
  );
}

export function TableCell({
  className,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement>) {
  const density = useContext(TableDensityContext);
  return (
    <td
      {...rest}
      className={cn(
        "align-middle",
        density === "compact" ? "px-1.5 py-1" : "px-4 py-3",
        className,
      )}
    />
  );
}
