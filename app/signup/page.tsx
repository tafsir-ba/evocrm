import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";
import { IconLogo } from "@/lib/icons";

export const metadata = { title: "Create account — EvoHome CRM" };

export default function SignupPage() {
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
          For QA and staging access. Use a strong password — minimum 12 characters
          with at least one letter and one number.
        </p>

        <div className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
          <SignupForm />
        </div>

        <p className="text-[13px] text-[var(--color-ink-muted)] mt-6 text-center">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--color-brand-700)] hover:underline focus-ring rounded">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
