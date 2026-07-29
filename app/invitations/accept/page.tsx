import { Suspense } from "react";

import { AcceptInvitationClient } from "@/components/projects/accept-invitation-client";

export default function AcceptInvitationPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)] p-4">
      <Suspense fallback={<div className="text-[13px] text-[var(--color-ink-muted)]">Loading invitation…</div>}>
        <AcceptInvitationClient />
      </Suspense>
    </div>
  );
}
