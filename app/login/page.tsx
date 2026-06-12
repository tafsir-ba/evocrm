import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { IconGoogle, IconLogo, IconEye } from "@/lib/icons";

export const metadata = { title: "Sign in — EvoHome CRM" };

export default function LoginPage() {
  return (
    <div className="min-h-screen flex bg-white">
      <aside className="hidden lg:flex flex-col justify-between relative w-[44%] xl:w-[48%] overflow-hidden border-r border-[var(--color-line)]">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=70"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-[#0f172a]/55 via-[#0f172a]/15 to-transparent" />
        </div>

        <div className="relative p-10 z-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-white"
            aria-label="EvoHome CRM"
          >
            <span
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg backdrop-blur-md"
              style={{ background: "rgba(255,255,255,0.18)" }}
            >
              <IconLogo size={20} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-bold text-[15px] tracking-tight">EvoHome</span>
              <span className="text-[10.5px] tracking-[0.14em] uppercase opacity-80">
                CRM
              </span>
            </span>
          </Link>
        </div>

        <div className="relative p-10 z-10 text-white max-w-[460px]">
          <p className="text-[12px] uppercase tracking-[0.18em] font-semibold opacity-80 mb-3">
            Real estate workspace
          </p>
          <h2 className="text-[26px] font-bold leading-tight tracking-tight mb-2">
            Run your day from a single calm dashboard.
          </h2>
          <p className="text-[14px] opacity-85 leading-relaxed">
            Leads, properties, pipeline, activities and follow-up drips —
            in one operational space your team actually uses.
          </p>
        </div>
      </aside>

      <section className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          <Link
            href="/"
            className="lg:hidden inline-flex items-center gap-2.5 mb-8"
          >
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
            Welcome back
          </h1>
          <p className="text-[13.5px] text-[var(--color-ink-muted)] mt-1.5">
            Sign in to your EvoHome workspace.
          </p>

          <div
            role="note"
            className="mt-5 rounded-lg border border-[var(--color-info-border)] bg-[var(--color-info-bg)] px-3.5 py-3 text-[12.5px] text-[var(--color-info-fg)] leading-relaxed"
          >
            Design preview only — controls are disabled. Real Google authentication
            and email sign-in are implemented in Phase 2.
          </div>

          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Authentication arrives in Phase 2"
            className="mt-5 w-full h-11 inline-flex items-center justify-center gap-2.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-muted)] text-[14px] font-medium text-[var(--color-ink-muted)] cursor-not-allowed opacity-80"
          >
            <IconGoogle size={18} />
            Continue with Google
            <span className="text-[11px] font-semibold uppercase tracking-wide">
              Phase 2
            </span>
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--color-line)]" />
            <span className="text-[11.5px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)] font-semibold">
              Or with email
            </span>
            <div className="flex-1 h-px bg-[var(--color-line)]" />
          </div>

          <fieldset disabled className="space-y-3.5 border-0 p-0 m-0 min-w-0">
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                disabled
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                hint={
                  <span className="text-[var(--color-ink-faint)]">
                    Forgot password?
                  </span>
                }
              >
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                trailingIcon={<IconEye size={15} />}
                disabled
              />
            </div>

            <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-ink-faint)] select-none">
              <input
                type="checkbox"
                disabled
                className="w-3.5 h-3.5 accent-[var(--color-brand-600)] rounded"
              />
              Remember me on this device
            </label>

            <Button type="button" size="lg" fullWidth disabled>
              Sign in
            </Button>
          </fieldset>

          <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-6 text-center">
            New to EvoHome?{" "}
            <span className="text-[var(--color-ink-faint)]">
              Request workspace access (Phase 2)
            </span>
          </p>

          <p className="text-[11.5px] text-[var(--color-ink-faint)] mt-10 text-center">
            By signing in you agree to our Terms and Privacy Notice.
          </p>
        </div>
      </section>
    </div>
  );
}
