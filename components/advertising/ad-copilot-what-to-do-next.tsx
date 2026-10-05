import Link from "next/link";

import type {
  AdCopilotFunnelCounts,
  AdCopilotNextStep,
} from "@/lib/ad-copilot-next-step";

const GUARDRAILS = [
  "Nothing is changed automatically.",
  "We do not publish, pause, or edit ads from here.",
  "We do not change budgets from here.",
  "We do not send customer or conversion data to Meta from here.",
] as const;

export function AdCopilotWhatToDoNext({
  step,
  funnel,
  settingsHref,
}: {
  step: AdCopilotNextStep;
  funnel: AdCopilotFunnelCounts;
  settingsHref: string;
}) {
  return (
    <section
      aria-labelledby="ad-copilot-action-center-heading"
      className="rounded-xl border border-[var(--color-line)] bg-white p-4 space-y-4"
      data-testid="ad-copilot-action-center"
    >
      <div>
        <h3
          id="ad-copilot-action-center-heading"
          className="text-[14px] font-semibold text-[var(--color-ink)]"
        >
          Ad Copilot Action Center
        </h3>
        <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-1">
          One clear suggestion from the numbers you already have. Nothing
          changes automatically — you choose any next step by hand.
        </p>
      </div>

      <div>
        <p className="text-[14px] font-semibold text-[var(--color-ink)]">
          {step.title}
        </p>
      </div>

      <dl className="space-y-3 text-[13px]">
        <div>
          <dt className="font-semibold text-[var(--color-ink)]">
            What the numbers say
          </dt>
          <dd className="text-[var(--color-ink-muted)] mt-0.5">
            {step.whatNumbersSay}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--color-ink)]">
            Why it matters
          </dt>
          <dd className="text-[var(--color-ink-muted)] mt-0.5">
            {step.whyItMatters}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--color-ink)]">
            What you can do next
          </dt>
          <dd className="text-[var(--color-ink)] mt-0.5">
            {step.manualNextStep}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--color-ink)]">Evidence</dt>
          <dd
            className="text-[var(--color-ink-muted)] mt-0.5"
            data-testid="ad-copilot-evidence-label"
          >
            {step.evidenceLabel}
          </dd>
        </div>
      </dl>

      {step.needsSettingsRefresh ? (
        <p>
          <Link
            href={settingsHref}
            className="text-[13px] font-medium text-[var(--color-brand-700)] underline underline-offset-2"
          >
            Open Settings → Paid ads
          </Link>
        </p>
      ) : null}

      <div>
        <p className="text-[12.5px] font-semibold text-[var(--color-ink)]">
          Read-only guardrails
        </p>
        <ul className="mt-1 space-y-1 text-[12.5px] text-[var(--color-ink-muted)] list-disc pl-5">
          {GUARDRAILS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <ul
        className="grid gap-1 sm:grid-cols-2 text-[12.5px] text-[var(--color-ink-muted)]"
        aria-label="Linked results used for this suggestion"
      >
        <li>People who filled a form: {funnel.formLeads}</li>
        <li>Good leads: {funnel.qualifiedLeads}</li>
        <li>Sales in the pipeline: {funnel.opportunities}</li>
        <li>Won sales: {funnel.wins}</li>
      </ul>
    </section>
  );
}
