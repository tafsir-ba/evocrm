import { Suspense, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

export function ProjectFilterSuspense({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        fallback ?? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full max-w-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        )
      }
    >
      {children}
    </Suspense>
  );
}
