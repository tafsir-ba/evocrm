"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { PageContainer } from "@/components/layout/page-header";

export default function WorkspaceSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer>
      <ErrorState
        title="Something went wrong"
        description={error.message || "This page failed to render. You can retry or navigate away."}
        primaryAction={{ label: "Retry", onClick: reset }}
      />
    </PageContainer>
  );
}
