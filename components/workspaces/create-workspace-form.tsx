"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CurrencySelect, TimezoneSelect } from "@/components/domain/locale-selectors";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { workspaceNavPath } from "@/lib/workspace-paths";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("agency");
  const [timezone, setTimezone] = useState("UTC");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          timezone,
          defaultCurrency,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error?.message ?? "Could not create workspace.");
        return;
      }

      const slug = payload.data.workspace.slug as string;
      router.push(workspaceNavPath(slug, "dashboard"));
      router.refresh();
    } catch {
      setError("Could not create workspace.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          id="workspace-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="EvoHome CRM"
          required
          minLength={2}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="workspace-type">Type</Label>
        <Select
          id="workspace-type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="agency">Agency</option>
          <option value="developer">Developer</option>
          <option value="brokerage">Brokerage</option>
          <option value="other">Other</option>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="workspace-timezone">Timezone</Label>
          <TimezoneSelect
            id="workspace-timezone"
            value={timezone}
            onChange={setTimezone}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="workspace-currency">Currency</Label>
          <CurrencySelect
            id="workspace-currency"
            value={defaultCurrency}
            onChange={setDefaultCurrency}
          />
        </div>
      </div>

      {error && (
        <p className="text-[13px] text-[var(--color-danger-fg)]">{error}</p>
      )}

      <Button type="submit" size="lg" fullWidth disabled={submitting}>
        {submitting ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
