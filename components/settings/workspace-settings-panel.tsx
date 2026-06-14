"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";

type WorkspaceSettings = {
  id: string;
  name: string;
  slug: string;
  type: string;
  timezone: string;
  defaultCurrency: string;
};

type WorkspaceSettingsPanelProps = {
  workspaceSlug: string;
  canUpdate: boolean;
};

const WORKSPACE_TYPES = [
  { value: "agency", label: "Agency" },
  { value: "developer", label: "Developer" },
  { value: "brokerage", label: "Brokerage" },
  { value: "other", label: "Other" },
];

export function WorkspaceSettingsPanel({
  workspaceSlug,
  canUpdate,
}: WorkspaceSettingsPanelProps) {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "agency",
    timezone: "UTC",
    defaultCurrency: "USD",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const response = await fetch(`${apiBase}/settings`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load settings.");
      }

      const data = payload.data.settings as WorkspaceSettings;
      setSettings(data);
      setForm({
        name: data.name,
        type: data.type,
        timezone: data.timezone,
        defaultCurrency: data.defaultCurrency,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!canUpdate) return;

    setSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to save settings.");
      }

      const data = payload.data.settings as WorkspaceSettings;
      setSettings(data);
      setSaveMessage("Workspace settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (forbidden) {
    return (
      <PermissionDenied
        title="Workspace settings unavailable"
        description="You do not have permission to view workspace settings."
      />
    );
  }

  if (loading) {
    return (
      <Card>
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </Card>
    );
  }

  if (error && !settings) {
    return (
      <ErrorState
        title="Could not load settings"
        description={error}
        primaryAction={{ label: "Retry", onClick: () => void loadSettings() }}
      />
    );
  }

  return (
    <Card>
      <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Workspace name">
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              disabled={!canUpdate}
              required
            />
          </Field>
          <Field label="Slug (read-only)">
            <Input value={settings?.slug ?? ""} disabled readOnly />
          </Field>
          <Field label="Type">
            <select
              className="w-full h-9 rounded-lg border border-[var(--color-line)] px-3 text-[13px] bg-white disabled:opacity-60"
              value={form.type}
              onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
              disabled={!canUpdate}
            >
              {WORKSPACE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Time zone">
            <Input
              value={form.timezone}
              onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
              disabled={!canUpdate}
            />
          </Field>
          <Field label="Default currency">
            <Input
              value={form.defaultCurrency}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  defaultCurrency: event.target.value.toUpperCase(),
                }))
              }
              disabled={!canUpdate}
              maxLength={3}
            />
          </Field>
        </div>

        {error && <p className="text-[12.5px] text-[var(--color-danger)]">{error}</p>}
        {saveMessage && (
          <p className="text-[12.5px] text-[var(--color-success)]">{saveMessage}</p>
        )}

        {canUpdate && (
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        )}
      </form>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold">
        {label}
      </span>
      {children}
    </label>
  );
}
