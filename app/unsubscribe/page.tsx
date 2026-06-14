import { processUnsubscribe } from "@/server/services/unsubscribe";

type SearchParams = Promise<{ token?: string }>;

export const metadata = { title: "Unsubscribe — EvoHome CRM" };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const token = params.token?.trim();

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)] p-6">
        <div className="max-w-md w-full rounded-xl border border-[var(--color-line)] bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-[var(--color-ink)]">
            Invalid link
          </h1>
          <p className="mt-2 text-[13px] text-[var(--color-ink-muted)]">
            This unsubscribe link is missing or invalid.
          </p>
        </div>
      </main>
    );
  }

  const result = await processUnsubscribe(token);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)] p-6">
      <div className="max-w-md w-full rounded-xl border border-[var(--color-line)] bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-[var(--color-ink)]">
          {result.success ? "Unsubscribed" : "Unable to unsubscribe"}
        </h1>
        <p className="mt-2 text-[13px] text-[var(--color-ink-muted)]">
          {result.message}
        </p>
      </div>
    </main>
  );
}
