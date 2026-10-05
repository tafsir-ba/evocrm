import Link from "next/link";

import { CookieConsentBanner } from "@/components/cookie-consent/cookie-consent-banner";
import {
  COOKIE_CONSENT_NOTICE,
  COOKIE_CONSENT_VERSION,
} from "@/lib/cookie-consent";

export const metadata = {
  title: "Privacy & cookies — EvoHome",
};

export default function PrivacyCookiesPage() {
  return (
    <main className="min-h-screen bg-[var(--color-canvas)] px-6 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">
          <Link href="/login" className="underline">
            Back to sign in
          </Link>
        </p>
        <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
          Privacy & cookies
        </h1>
        <p className="text-[14px] text-[var(--color-ink-muted)] leading-relaxed">
          Plain-language guide for visitors to Satigny Duplex and other EvoHome
          paid landings. Policy version: <code>{COOKIE_CONSENT_VERSION}</code>.
        </p>

        <section className="space-y-2">
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">
            What we ask
          </h2>
          <p className="text-[14px] text-[var(--color-ink)] leading-relaxed">
            {COOKIE_CONSENT_NOTICE}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">
            Cookie categories
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-[14px] text-[var(--color-ink)]">
            <li>
              <strong>Necessary</strong> — always on so the page works. Choosing
              these alone is <em>not</em> advertising consent.
            </li>
            <li>
              <strong>Optional advertising measurement</strong> — only if you
              accept. Used for Meta measurement and conversion tracking so we
              can see which ads bring real interest. Off unless you say yes.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">
            Your choices
          </h2>
          <p className="text-[14px] text-[var(--color-ink)] leading-relaxed">
            You can <strong>Accept optional cookies</strong>,{" "}
            <strong>Decline</strong>, or <strong>Manage choices</strong>. Nothing
            is pre-ticked for advertising. You can withdraw later from “Cookie
            choices”. We record the consent version, the time you decided, which
            categories you chose, and whether you withdrew.
          </p>
          <p className="text-[14px] text-[var(--color-ink)] leading-relaxed">
            If you decline or withdraw optional advertising cookies, we do{" "}
            <strong>not</strong> process Meta measurement or conversion data for
            you. Accepting general website terms alone never counts as advertising
            consent. Email newsletter consent is separate.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">
            Contact
          </h2>
          <p className="text-[14px] text-[var(--color-ink-muted)] leading-relaxed">
            Questions about this page? Ask your EvoHome contact or workspace
            admin.
          </p>
        </section>
      </div>
      <CookieConsentBanner />
    </main>
  );
}
