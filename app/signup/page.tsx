import Link from "next/link";

import { AuthMethodDivider } from "@/components/auth/auth-method-divider";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { SignupForm } from "@/components/auth/signup-form";
import { isGoogleAuthConfigured } from "@/auth.config";
import { IconLogo } from "@/lib/icons";

export const metadata = { title: "Create account — EvoHome CRM" };

type SignupPageProps = {
  searchParams: Promise<{ callbackUrl?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { callbackUrl } = await searchParams;
  const redirectTo = callbackUrl ?? "/workspaces";
  const googleEnabled = isGoogleAuthConfigured();
  const loginHref = callbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/login";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)] p-6 sm:p-10">
      <div className="w-full max-w-[400px]">
        <Link href="/" className="inline-flex items-center gap-2.5 mb-8">
          <span
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-white"
            style={{ background: "var(--color-brand-600)" }}
          >
            <IconLogo size={20} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-bold text-[15px] text-[var(--color-ink)] tracking-tight">
              EvoHome
            </span>
            <span className="text-[10.5px] tracking-[0.14em] uppercase text-[var(--color-ink-faint)]">
              CRM
            </span>
          </span>
        </Link>

        <h1 className="text-[24px] font-bold text-[var(--color-ink)] tracking-tight">
          Create your account
        </h1>
        <p className="text-[13.5px] text-[var(--color-ink-muted)] mt-1.5">
          {googleEnabled
            ? "Sign up with Google or create an email and password account."
            : "Create an account with your email and a strong password — minimum 12 characters with at least one letter and one number."}
        </p>

        {googleEnabled && <GoogleSignInButton callbackUrl={redirectTo} />}

        {googleEnabled && <AuthMethodDivider label="Or with email" />}

        <div
          className={
            googleEnabled
              ? undefined
              : "mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6"
          }
        >
          <SignupForm callbackUrl={redirectTo} />
        </div>

        <p className="text-[13px] text-[var(--color-ink-muted)] mt-6 text-center">
          Already have an account?{" "}
          <Link
            href={loginHref}
            className="text-[var(--color-brand-700)] hover:underline focus-ring rounded"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
