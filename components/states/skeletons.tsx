import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bg-white border border-[var(--color-line)] rounded-xl overflow-hidden">
      <div className="h-11 bg-[var(--color-canvas)] border-b border-[var(--color-line)] flex items-center px-4 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-20" />
        ))}
      </div>
      <div className="divide-y divide-[var(--color-line)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-14 flex items-center px-4 gap-6">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ height = 120 }: { height?: number }) {
  return (
    <div className="bg-white border border-[var(--color-line)] rounded-xl p-5 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7" style={{ width: "60%" }} />
      <Skeleton className="h-3 w-32" />
      <Skeleton className="w-full" style={{ height: height - 80 }} />
    </div>
  );
}

export function KanbanSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-[var(--color-canvas)] border border-[var(--color-line)] rounded-xl p-3 space-y-2"
        >
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: 3 }).map((_, j) => (
            <Skeleton key={j} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}
