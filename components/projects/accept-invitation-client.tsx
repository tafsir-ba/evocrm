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
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<{
    workspaceId: string;
    projectId: string;
    projectRole: string;
    workspaceSlug: string | null;
  } | null>(null);

  const acceptCallbackPath = token
    ? `/invitations/accept?token=${encodeURIComponent(token)}`
    : "/invitations/accept";
  const loginHref = `/login?callbackUrl=${encodeURIComponent(acceptCallbackPath)}`;
  const signupHref = `/signup?callbackUrl=${encodeURIComponent(acceptCallbackPath)}`;

  useEffect(() => {
    if (!PROJECT_SHARING_ENABLED || !token || status !== "idle") {
      return;
    }

    async function accept() {
      setStatus("accepting");
      setErrorMessage(null);
      setErrorCode(null);

      try {
        const response = await fetch("/api/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const payload = await response.json();

        if (!response.ok) {
          const code = payload.error?.code ?? null;
          setErrorCode(code);
          if (code === "UNAUTHENTICATED") {
            window.location.href = loginHref;
            return;
          }
          setStatus("error");
          setErrorMessage(payload.error?.message ?? "Could not accept invitation.");
          return;
        }

        setResult(payload.data);
        setStatus("success");

        const slug = payload.data?.workspaceSlug;
        const projectId = payload.data?.projectId;
        if (slug && projectId) {
          window.location.href = `/w/${slug}/projects/${projectId}`;
        }
      } catch {
        setStatus("error");
        setErrorMessage("Something went wrong. Please try again.");
      }
    }

    void accept();
  }, [token, status, loginHref]);

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

  const successHref =
    result?.workspaceSlug && result.projectId
      ? `/w/${result.workspaceSlug}/projects/${result.projectId}`
      : "/workspaces";

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
          <Button onClick={() => (window.location.href = successHref)}>
            {result?.workspaceSlug ? "Open project" : "Go to workspaces"}
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
          <div className="flex flex-col gap-2 items-center">
            <Button variant="secondary" onClick={() => (window.location.href = loginHref)}>
              Sign in
            </Button>
            <Button variant="ghost" onClick={() => (window.location.href = signupHref)}>
              Create an account
            </Button>
          </div>
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
