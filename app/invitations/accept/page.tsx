"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AcceptInvitationPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"idle" | "accepting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{
    workspaceId: string;
    projectId: string;
    projectRole: string;
  } | null>(null);

  async function accept() {
    if (!token) {
      setStatus("error");
      setErrorMessage("Invalid invitation link.");
      return;
    }

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

  useEffect(() => {
    if (token && status === "idle") {
      void accept();
    }
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)] p-4">
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
              You're in!
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
              {errorMessage}
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
    </div>
  );
}
