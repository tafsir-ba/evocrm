import Link from "next/link";

import type {
  AdCopilotFunnelCounts,
  AdCopilotNextStep,
} from "@/lib/ad-copilot-next-step";

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
      aria-labelledby="ad-copilot-next-heading"
      className="rounded-xl border border-[var(--color-line)] bg-white p-4 space-y-3"
    >
      <div>
        <h3
          id="ad-copilot-next-heading"
          className="text-[14px] font-semibold text-[var(--color-ink)]"
        >
          What to do next
        </h3>
        <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-1">
          A simple suggestion from the numbers you already have. Nothing is
          changed automatically.
        </p>
      </div>

      <div>
        <p className="text-[14px] font-semibold text-[var(--color-ink)]">
          {step.title}
        </p>
        <p className="text-[13px] text-[var(--color-ink-muted)] mt-1">
          {step.explanation}
        </p>
      </div>

      <p className="text-[13px] text-[var(--color-ink)]">
        <span className="font-semibold">Next: </span>
        {step.nextAction}
      </p>

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

      <ul className="grid gap-1 sm:grid-cols-2 text-[12.5px] text-[var(--color-ink-muted)]">
        <li>People who filled a form: {funnel.formLeads}</li>
        <li>Good leads: {funnel.qualifiedLeads}</li>
        <li>Sales in the pipeline: {funnel.opportunities}</li>
        <li>Won sales: {funnel.wins}</li>
      </ul>
    </section>
  );
}
