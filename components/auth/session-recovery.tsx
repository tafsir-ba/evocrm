"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type SessionRecoveryProps = {
  callbackUrl?: string;
};

export function SessionRecovery({
  callbackUrl = "/login",
}: SessionRecoveryProps) {
  const [failed, setFailed] = useState(false);

  async function clearSession() {
    setFailed(false);

    try {
      await signOut({ callbackUrl });
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    void clearSession();
    // Run once on mount; callbackUrl is fixed for this recovery page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)] px-6">
      <section className="w-full max-w-md rounded-2xl border border-[var(--color-line)] bg-white p-8 text-center shadow-[var(--shadow-sm)]">
        <h1 className="text-[24px] font-bold tracking-tight text-[var(--color-ink)]">
          Refreshing your session
        </h1>
        <p className="mt-3 text-[14px] leading-6 text-[var(--color-ink-muted)]">
          Your previous sign-in session is no longer valid. We are taking you
          back to sign in.
        </p>

        {failed ? (
          <div className="mt-6">
            <p
              role="alert"
              className="mb-4 rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-[13px] text-[var(--color-danger-fg)]"
            >
              We could not refresh your session automatically.
            </p>
            <Button type="button" size="lg" fullWidth onClick={clearSession}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="mt-6 flex justify-center" aria-hidden="true">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-brand-600)] border-t-transparent" />
          </div>
        )}
      </section>
    </main>
  );
}
