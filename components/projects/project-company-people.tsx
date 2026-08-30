"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { workspacePath } from "@/lib/workspace-paths";

export type ProjectCompanyPerson = {
  id: string;
  companyId: string | null;
  projectId: string | null;
  fullName: string;
  email: string | null;
};

type ProjectCompanyPeopleProps = {
  workspaceSlug: string;
  companyName: string | null;
  companyId: string | null;
  people: ProjectCompanyPerson[];
  associablePeople: ProjectCompanyPerson[];
  canAssociate: boolean;
  onAssociated: () => Promise<void> | void;
};

export function ProjectCompanyPeople({
  workspaceSlug,
  companyName,
  companyId,
  people,
  associablePeople,
  canAssociate,
  onAssociated,
}: ProjectCompanyPeopleProps) {
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function associatePerson() {
    if (!companyId || !selectedLeadId) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/leads/${selectedLeadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not associate this person.");
      }
      setSelectedLeadId("");
      await onAssociated();
    } catch (associateError) {
      setError(associateError instanceof Error ? associateError.message : "Could not associate this person.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--color-line)] bg-white p-4 space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">Company people</h2>
        <p className="mt-1 text-[12.5px] text-[var(--color-ink-muted)]">
          {companyName
            ? `People linked to ${companyName}. These are CRM records, not free-text names on the project.`
            : "Link a primary company to discover and associate its people from this project."}
        </p>
      </div>

      {people.length === 0 ? (
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          No people are linked to this company yet.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)] rounded-md border border-[var(--color-line)]">
          {people.map((person) => (
            <li key={person.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-[var(--color-ink)]">
                  {person.fullName}
                </p>
                {person.email ? (
                  <p className="truncate text-[12px] text-[var(--color-ink-muted)]">{person.email}</p>
                ) : null}
              </div>
              <Link
                href={workspacePath(workspaceSlug, "leads", person.id)}
                className="shrink-0 text-[12.5px] font-medium text-[var(--color-brand-700)] hover:underline"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canAssociate && companyId ? (
        <div className="space-y-2">
          <label className="block text-[12.5px] font-medium text-[var(--color-ink-soft)]" htmlFor="associate-company-person">
            Associate a person from this project
          </label>
          {associablePeople.length === 0 ? (
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Add people as leads on this project, then associate them with the company here.
            </p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                id="associate-company-person"
                value={selectedLeadId}
                onChange={(event) => setSelectedLeadId(event.target.value)}
                className="h-9 min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-white px-2 text-[13px] text-[var(--color-ink)]"
              >
                <option value="">Select a person…</option>
                {associablePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                    {person.email ? ` · ${person.email}` : ""}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                disabled={!selectedLeadId || saving}
                onClick={() => void associatePerson()}
              >
                {saving ? "Associating…" : "Associate"}
              </Button>
            </div>
          )}
          {error ? <p className="text-[12.5px] text-[var(--color-danger-fg)]">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
