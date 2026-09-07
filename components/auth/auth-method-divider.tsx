export function AuthMethodDivider({ label }: { label: string }) {
  return (
    <div className="my-6 flex items-center gap-3">
      <div className="flex-1 h-px bg-[var(--color-line)]" />
      <span className="text-[11.5px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)] font-semibold">
        {label}
      </span>
      <div className="flex-1 h-px bg-[var(--color-line)]" />
    </div>
  );
}
