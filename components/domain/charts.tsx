import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { IconArrowDown, IconArrowUp } from "@/lib/icons";
import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  delta,
  hint,
  icon,
}: {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
  icon?: ReactNode;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="!p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium text-[var(--color-ink-muted)] uppercase tracking-wide">
          {label}
        </p>
        {icon && <span className="text-[var(--color-ink-muted)]">{icon}</span>}
      </div>
      <p className="mt-2 text-[26px] font-bold tracking-tight text-[var(--color-ink)] tabular leading-tight">
        {value}
      </p>
      {typeof delta === "number" && (
        <p
          className={cn(
            "mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium",
            positive
              ? "text-[var(--color-success-fg)]"
              : "text-[var(--color-danger-fg)]",
          )}
        >
          {positive ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />}
          {positive ? "+" : ""}
          {delta}%
          <span className="text-[var(--color-ink-faint)] font-normal ml-1">
            {hint}
          </span>
        </p>
      )}
    </Card>
  );
}

export function BarChart({
  data,
  max,
}: {
  data: { stage: string; count: number }[];
  max?: number;
}) {
  const top = max ?? Math.max(...data.map((d) => d.count));
  return (
    <div className="space-y-3">
      {data.map((d) => {
        const pct = Math.max(2, (d.count / top) * 100);
        return (
          <div key={d.stage} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-[12.5px] text-[var(--color-ink-soft)]">
              {d.stage}
            </span>
            <div className="flex-1 h-2 rounded-full bg-[var(--color-muted)] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background:
                    "linear-gradient(90deg, var(--color-brand-500), var(--color-brand-700))",
                }}
              />
            </div>
            <span className="w-8 text-right text-[12.5px] font-semibold text-[var(--color-ink)] tabular">
              {d.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function DonutChart({
  data,
  total,
}: {
  data: { label: string; value: number; color: string }[];
  total?: number;
}) {
  const sum = total ?? data.reduce((a, b) => a + b.value, 0);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <svg width={148} height={148} viewBox="0 0 148 148">
          <circle
            cx="74"
            cy="74"
            r={radius}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth="18"
          />
          {data.map((d) => {
            const len = (d.value / sum) * circumference;
            const dashArray = `${len} ${circumference - len}`;
            const el = (
              <circle
                key={d.label}
                cx="74"
                cy="74"
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth="18"
                strokeDasharray={dashArray}
                strokeDashoffset={-offset}
                transform="rotate(-90 74 74)"
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold">
            Total
          </span>
          <span className="text-[22px] font-bold tabular text-[var(--color-ink)]">
            {sum}
          </span>
        </div>
      </div>
      <div className="flex-1 space-y-2 min-w-0">
        {data.map((d) => {
          const pct = Math.round((d.value / sum) * 100);
          return (
            <div key={d.label} className="flex items-center gap-2 text-[12.5px]">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: d.color }}
              />
              <span className="text-[var(--color-ink-soft)] flex-1 truncate">
                {d.label}
              </span>
              <span className="text-[var(--color-ink)] font-semibold tabular">
                {d.value}
              </span>
              <span className="text-[var(--color-ink-faint)] tabular w-10 text-right">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
