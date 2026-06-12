"use client";

import { signIn } from "next-auth/react";

import { IconGoogle } from "@/lib/icons";

export function GoogleSignInButton({
  callbackUrl = "/workspaces",
}: {
  callbackUrl?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => signIn("google", { callbackUrl })}
      className="mt-5 w-full h-11 inline-flex items-center justify-center gap-2.5 rounded-lg border border-[var(--color-line)] bg-white text-[14px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-muted)] transition-colors focus-ring"
    >
      <IconGoogle size={18} />
      Continue with Google
    </button>
  );
}
