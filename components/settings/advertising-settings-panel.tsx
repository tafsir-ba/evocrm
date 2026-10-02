"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatApiErrorMessage } from "@/lib/format-api-error";

type Connection = {
  id: string;
  name: string;
  status: string;
  freshnessLabel: string;
  writeScopesEnabled: boolean;
  healthMessage: string | null;
  lastSuccessfulSyncAt: string | null;
};

type AdvertisingSettingsPanelProps = {
  workspaceSlug: string;
  canConnect: boolean;
  canCreate: boolean;
};

export function AdvertisingSettingsPanel({
  workspaceSlug,
  canConnect,
  canCreate,
}: AdvertisingSettingsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmConnect, setConfirmConnect] = useState(false);
  const [confirmPractice, setConfirmPractice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/advertising/connections`,
      );
      const json = (await response.json()) as {
        data?: { connections: Connection[] };
        error?: { message?: string; details?: Record<string, unknown> };
      };
      if (!response.ok) {
        throw new Error(
          formatApiErrorMessage(json, "Could not load paid ads connections."),
        );
      }
      setConnections(json.data?.connections ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load paid ads connections.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect(useFixture: boolean) {
    if (!canConnect) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/advertising/connections`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            useFixture
              ? { useFixture: true, name: "Meta practice (demo)" }
              : { accessToken, name: "Meta Business" },
          ),
        },
      );
      const json = (await response.json()) as {
        error?: { message?: string; details?: Record<string, unknown> };
      };
      if (!response.ok) {
        throw new Error(formatApiErrorMessage(json, "Could not connect Meta."));
      }
      setAccessToken("");
      setConfirmConnect(false);
      setConfirmPractice(false);
      setMessage(
        useFixture
          ? "Practice connection ready. You can refresh sample ads data."
          : "Meta connected for reading only. Refresh to load accounts.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Meta.");
    } finally {
      setBusy(false);
    }
  }

  async function ensurePilot() {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/advertising/pilot/ensure`,
        { method: "POST" },
      );
      const json = (await response.json()) as {
        error?: { message?: string; details?: Record<string, unknown> };
      };
      if (!response.ok) {
        throw new Error(
          formatApiErrorMessage(
            json,
            "Could not set up the Satigny duplex paid-ads plan.",
          ),
        );
      }
      setMessage("Satigny duplex paid-ads plan is ready.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not set up the Satigny duplex paid-ads plan.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refresh(connectionId: string) {
    if (!canConnect) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/advertising/sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId }),
        },
      );
      const json = (await response.json()) as {
        data?: { sync: { accounts: number; campaigns: number; ads: number } };
        error?: { message?: string; details?: Record<string, unknown> };
      };
      if (!response.ok) {
        throw new Error(formatApiErrorMessage(json, "Could not refresh Meta."));
      }
      const sync = json.data?.sync;
      setMessage(
        sync
          ? `Refreshed ${sync.accounts} accounts, ${sync.campaigns} campaigns, ${sync.ads} ads.`
          : "Refresh finished.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh Meta.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading paid ads settings">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">
          Paid ads (read only)
        </h2>
        <p className="text-[13px] text-[var(--color-ink-muted)] mt-1 max-w-2xl">
          Connect Meta to view ad accounts for the Satigny duplex pilot in Geneva.
          You can look at results — you cannot publish or change spend from here yet.
        </p>
      </div>

      {error ? <ErrorState title="Something went wrong" description={error} /> : null}
      {message ? (
        <p className="text-[13px] text-[var(--color-brand-700)] bg-[var(--color-brand-50)] rounded-lg px-3 py-2">
          {message}
        </p>
      ) : null}

      <section className="rounded-xl border border-[var(--color-line)] bg-white p-5 space-y-3">
        <h3 className="text-[14px] font-semibold">1. Prepare Satigny plan</h3>
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">
          Creates a Growth Campaign locked to project <strong>Satigny duplex</strong>{" "}
          (Geneva, Switzerland).
        </p>
        <Button
          type="button"
          disabled={!canCreate || busy}
          onClick={() => void ensurePilot()}
        >
          Set up Satigny paid-ads plan
        </Button>
      </section>

      <section className="rounded-xl border border-[var(--color-line)] bg-white p-5 space-y-4">
        <h3 className="text-[14px] font-semibold">2. Connect Meta</h3>
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">
          Use a read-only Meta token, or the practice connection to explore with sample data
          (no live Meta calls).
        </p>

        {canConnect ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="meta-token">Meta access token</Label>
              <Input
                id="meta-token"
                type="password"
                autoComplete="off"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder="Paste token — never share it in chat"
              />
              <p className="text-[12px] text-[var(--color-ink-muted)]">
                Tip: this pilot only needs permission to read ads. Write permissions stay off.
              </p>
            </div>

            {!confirmConnect && !confirmPractice ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy || !accessToken.trim()}
                  onClick={() => {
                    setConfirmPractice(false);
                    setConfirmConnect(true);
                  }}
                >
                  Connect Meta
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setConfirmConnect(false);
                    setConfirmPractice(true);
                  }}
                >
                  Use practice data
                </Button>
              </div>
            ) : confirmPractice ? (
              <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3 space-y-2">
                <p className="text-[13px]">
                  Load <strong>practice</strong> Meta data (sample accounts only — no live Meta
                  calls)?
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void connect(true)}
                  >
                    Yes, use practice data
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setConfirmPractice(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3 space-y-2">
                <p className="text-[13px]">
                  Connect Meta for <strong>reading only</strong>? We will not publish ads or
                  change budgets from this screen.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void connect(false)}
                  >
                    Yes, connect
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setConfirmConnect(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Ask a workspace admin to connect Meta.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-[var(--color-line)] bg-white p-5 space-y-3">
        <h3 className="text-[14px] font-semibold">3. Your connections</h3>
        {connections.length === 0 ? (
          <EmptyState
            title="No Meta connection yet"
            description="Connect Meta or use practice data to see sample ad accounts."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="text-[13.5px] font-medium">{connection.name}</p>
                  <p className="text-[12px] text-[var(--color-ink-muted)]">
                    {connection.freshnessLabel}
                    {connection.healthMessage ? ` · ${connection.healthMessage}` : ""}
                    {connection.writeScopesEnabled ? " · Warning: write enabled" : " · Read only"}
                  </p>
                </div>
                {canConnect ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void refresh(connection.id)}
                  >
                    Refresh now
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
