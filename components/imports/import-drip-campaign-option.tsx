"use client";

type ImportDripCampaignOptionProps = {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

export function ImportDripCampaignOption({
  checked,
  disabled = false,
  onChange,
}: ImportDripCampaignOptionProps) {
  return (
    <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] p-3 space-y-2">
      <p className="text-[12px] font-medium text-[var(--color-ink)]">Drip campaign enrollment</p>
      <p className="text-[12px] text-[var(--color-ink-muted)]">
        Imported leads can be considered for active drip campaigns after they are created.
      </p>
      <p className="text-[12px] text-[var(--color-ink-muted)]">
        If enabled, each successfully imported lead will be checked against active dripping
        campaigns for its project. Matching leads may be enrolled and may receive campaign
        emails.
      </p>
      <label className="flex items-start gap-2 text-[12px] text-[var(--color-ink)]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>Consider imported leads for active drip campaigns</span>
      </label>
    </div>
  );
}
