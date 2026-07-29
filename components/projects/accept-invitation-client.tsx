"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PROJECT_SHARING_ENABLED } from "@/lib/project-sharing-feature";

export function AcceptInvitationClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"idle" | "accepting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{
    workspaceId: string;
    projectId: string;
    projectRole: string;
  } | null>(null);

  useEffect(() => {
    if (!PROJECT_SHARING_ENABLED || !token || status !== "idle") {
      return;
    }

    async function accept() {
      setStatus("accepting");
      setErrorMessage(null);

      try {
        const response = await fetch("/api/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const payload = await response.json();

        if (!response.ok) {
          setStatus("error");
          setErrorMessage(payload.error?.message ?? "Could not accept invitation.");
          return;
        }

        setResult(payload.data);
        setStatus("success");
      } catch {
        setStatus("error");
        setErrorMessage("Something went wrong. Please try again.");
      }
    }

    void accept();
  }, [token, status]);

  if (!PROJECT_SHARING_ENABLED) {
    return (
      <Card className="max-w-md w-full text-center space-y-4">
        <h1 className="text-[18px] font-semibold text-[var(--color-ink)]">
          Project sharing is coming soon
        </h1>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          Project sharing remains disabled until project-scoped authorization is fully enforced.
        </p>
        <Button variant="secondary" onClick={() => (window.location.href = "/workspaces")}>
          Go to workspaces
        </Button>
      </Card>
    );
  }

  return (
    <Card className="max-w-md w-full text-center space-y-4">
      {status === "accepting" ? (
        <>
          <h1 className="text-[18px] font-semibold text-[var(--color-ink)]">
            Accepting invitation…
          </h1>
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Please wait while we set up your access.
          </p>
        </>
      ) : status === "success" ? (
        <>
          <h1 className="text-[18px] font-semibold text-[var(--color-ink)]">
            You&apos;re in!
          </h1>
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            You now have access to the project as {result?.projectRole?.replace("_", " ")}.
          </p>
          <Button onClick={() => (window.location.href = "/workspaces")}>
            Go to workspaces
          </Button>
        </>
      ) : status === "error" ? (
        <>
          <h1 className="text-[18px] font-semibold text-[var(--color-danger-fg)]">
            Could not accept invitation
          </h1>
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            {errorMessage ?? "Invalid invitation link."}
          </p>
          <Button variant="secondary" onClick={() => (window.location.href = "/login")}>
            Sign in
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-[18px] font-semibold text-[var(--color-ink)]">
            Project invitation
          </h1>
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            {token ? "Verifying your invitation…" : "Invalid invitation link."}
          </p>
        </>
      )}
    </Card>
  );
}
