import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { IconGoogle, IconLogo, IconEye } from "@/lib/icons";

export const metadata = { title: "Sign in — EvoHome CRM" };

export default function LoginPage() {
  return (
    <div className="min-h-screen flex bg-white">
      {/* Visual panel (hidden on mobile) */}
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

      {/* Form panel */}
      <section className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          {/* Mobile brand */}
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

          {/* Primary auth: Google */}
          <Link
            href="/dashboard"
            className="mt-7 w-full h-11 inline-flex items-center justify-center gap-2.5 rounded-lg border border-[var(--color-line)] bg-white hover:bg-[var(--color-canvas)] focus-ring text-[14px] font-medium text-[var(--color-ink)] transition-colors"
          >
            <IconGoogle size={18} />
            Continue with Google
          </Link>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--color-line)]" />
            <span className="text-[11.5px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)] font-semibold">
              Or with email
            </span>
            <div className="flex-1 h-px bg-[var(--color-line)]" />
          </div>

          {/* Email / password (visual only) */}
          <form className="space-y-3.5" action="/dashboard">
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                hint={
                  <Link
                    href="#"
                    className="text-[var(--color-brand-700)] hover:underline"
                  >
                    Forgot password?
                  </Link>
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
              />
            </div>

            <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-ink-soft)] cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-[var(--color-brand-600)] rounded"
              />
              Remember me on this device
            </label>

            <Button type="submit" size="lg" fullWidth>
              Sign in
            </Button>
          </form>

          <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-6 text-center">
            New to EvoHome?{" "}
            <Link
              href="#"
              className="text-[var(--color-brand-700)] font-medium hover:underline"
            >
              Request workspace access
            </Link>
          </p>

          <p className="text-[11.5px] text-[var(--color-ink-faint)] mt-10 text-center">
            By signing in you agree to our Terms and Privacy Notice.
          </p>
        </div>
      </section>
    </div>
  );
}
