"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";

type ReassignmentCounts = {
  leads: number;
  properties: number;
  opportunities: number;
  activities: number;
  projects: number;
};

type MemberOption = {
  userId: string;
  name: string | null;
  email: string;
};

type ReassignmentModalProps = {
  workspaceSlug: string;
  membership: { id: string; name: string | null; email: string };
  newStatus: "suspended" | "removed";
  activeMembers: MemberOption[];
  onClose: () => void;
  onComplete: () => void;
};

export function ReassignmentModal({
  workspaceSlug,
  membership,
  newStatus,
  activeMembers,
  onClose,
  onComplete,
}: ReassignmentModalProps) {
  const [counts, setCounts] = useState<ReassignmentCounts | null>(null);
  const [replacementUserId, setReplacementUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${apiBase}/memberships/${membership.id}/reassignment-summary`,
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load reassignment summary.");
      }

      setCounts(payload.data.counts as ReassignmentCounts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, membership.id]);

  useEffect(() => {
    void loadSummary();
    if (activeMembers.length > 0) {
      setReplacementUserId(activeMembers[0]!.userId);
    }
  }, [loadSummary, activeMembers]);

  async function handleSubmit() {
    if (!replacementUserId) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/memberships/${membership.id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replacementUserId,
          newStatus,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Reassignment failed.");
      }

      onComplete();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Reassignment failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reassign records"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={submitting || !replacementUserId || activeMembers.length === 0}
          >
            {submitting ? "Reassigning…" : "Reassign and continue"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">
          {membership.name ?? membership.email} has active assignments. Choose a replacement
          member before {newStatus === "suspended" ? "suspending" : "removing"} them.
        </p>

        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        )}

        {error && !counts && (
          <ErrorState
            title="Could not load summary"
            description={error}
            primaryAction={{ label: "Retry", onClick: () => void loadSummary() }}
          />
        )}

        {counts && (
          <ul className="text-[13px] space-y-1 text-[var(--color-ink-soft)]">
            <li>Leads: {counts.leads}</li>
            <li>Properties: {counts.properties}</li>
            <li>Opportunities: {counts.opportunities}</li>
            <li>Activities: {counts.activities}</li>
            <li>Projects: {counts.projects}</li>
          </ul>
        )}

        <label className="block space-y-1.5">
          <span className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold">
            Replacement member
          </span>
          <select
            className="w-full h-9 rounded-lg border border-[var(--color-line)] px-3 text-[13px] bg-white"
            value={replacementUserId}
            onChange={(event) => setReplacementUserId(event.target.value)}
            disabled={activeMembers.length === 0}
          >
            {activeMembers.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name ?? member.email}
              </option>
            ))}
          </select>
        </label>

        {error && counts && (
          <p className="text-[12.5px] text-[var(--color-danger)]">{error}</p>
        )}
      </div>
    </Modal>
  );
}
