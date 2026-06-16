"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type CampaignEnrollmentAudienceType = "leads" | "opportunities";

export type LeadEnrollmentOption = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  emailConsentStatus?: string;
};

export type OpportunityEnrollmentOption = {
  id: string;
  lead: { id: string; fullName: string; email: string | null } | null;
  property: { id: string; title: string; reference: string | null } | null;
  status: { label: string } | null;
};

type CampaignEnrollmentSelectorProps = {
  workspaceSlug: string;
  audienceType: CampaignEnrollmentAudienceType;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  excludedTargetIds?: string[];
  disabled?: boolean;
  selectionDisabled?: boolean;
};

export function getActiveEnrollmentTargetIds(
  enrollments: Array<{
    status: string;
    leadId?: string | null;
    opportunityId?: string | null;
  }>,
  audienceType: CampaignEnrollmentAudienceType,
): string[] {
  const nonTerminal = enrollments.filter(
    (enrollment) => enrollment.status === "active" || enrollment.status === "paused",
  );

  if (audienceType === "leads") {
    return nonTerminal
      .map((enrollment) => enrollment.leadId)
      .filter((id): id is string => Boolean(id));
  }

  return nonTerminal
    .map((enrollment) => enrollment.opportunityId)
    .filter((id): id is string => Boolean(id));
}

export function buildLeadEnrollmentPayload(leadId: string) {
  return { leadId };
}

export function buildOpportunityEnrollmentPayload(opportunityId: string) {
  return { opportunityId };
}

export function getEnrollmentSelectionError(
  audienceType: CampaignEnrollmentAudienceType,
  selectedIds: string[],
): string | null {
  if (selectedIds.length > 0) {
    return null;
  }

  return audienceType === "leads"
    ? "Select a lead to enroll."
    : "Select an opportunity to enroll.";
}

export function CampaignEnrollmentSelector({
  workspaceSlug,
  audienceType,
  selectedIds,
  onSelectionChange,
  excludedTargetIds = [],
  disabled = false,
  selectionDisabled = false,
}: CampaignEnrollmentSelectorProps) {
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<LeadEnrollmentOption[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityEnrollmentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;

  const loadOptions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams({ pageSize: "50" });
      const trimmedSearch = search.trim();

      if (trimmedSearch) {
        params.set("search", trimmedSearch);
      }

      const endpoint =
        audienceType === "leads"
          ? `${apiBase}/leads?${params.toString()}`
          : `${apiBase}/opportunities?${params.toString()}`;

      const response = await fetch(endpoint);

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Failed to load enrollment options.");
      }

      const payload = await response.json();

      if (audienceType === "leads") {
        setLeads(
          (payload.data ?? []).map(
            (lead: {
              id: string;
              fullName: string;
              email: string | null;
              phone: string | null;
              emailConsentStatus?: string;
            }) => ({
              id: lead.id,
              fullName: lead.fullName,
              email: lead.email,
              phone: lead.phone,
              emailConsentStatus: lead.emailConsentStatus,
            }),
          ),
        );
        setOpportunities([]);
      } else {
        setOpportunities(
          (payload.data ?? []).map(
            (opportunity: OpportunityEnrollmentOption) => ({
              id: opportunity.id,
              lead: opportunity.lead,
              property: opportunity.property,
              status: opportunity.status,
            }),
          ),
        );
        setLeads([]);
      }
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load enrollment options.",
      );
      setLeads([]);
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, audienceType, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOptions();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [loadOptions]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const excludedSet = useMemo(() => new Set(excludedTargetIds), [excludedTargetIds]);

  function toggleSelection(id: string) {
    if (disabled || selectionDisabled || excludedSet.has(id)) {
      return;
    }

    const next = new Set(selectedSet);

    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    onSelectionChange(Array.from(next));
  }

  const emptyLabel =
    audienceType === "leads"
      ? search.trim()
        ? "No leads match your search."
        : "No leads available to enroll."
      : search.trim()
        ? "No opportunities match your search."
        : "No opportunities available to enroll.";

  return (
    <div className="space-y-3">
      {selectionDisabled ? (
        <p className="text-[12px] text-[var(--color-ink-muted)]">
          Activate this campaign to enroll recipients. You can search available{" "}
          {audienceType === "leads" ? "leads" : "opportunities"} below.
        </p>
      ) : null}
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={
          audienceType === "leads"
            ? "Search leads by name, email, or phone…"
            : "Search opportunities by lead or property…"
        }
        disabled={disabled}
      />

      {loadError && (
        <p className="text-[12px] text-[var(--color-danger)]">{loadError}</p>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ) : audienceType === "leads" ? (
        leads.length === 0 ? (
          <p className="text-[12px] text-[var(--color-ink-muted)]">{emptyLabel}</p>
        ) : (
          <ul className="max-h-56 overflow-y-auto rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line)]">
            {leads.map((lead) => {
              const checked = selectedSet.has(lead.id);
              const alreadyEnrolled = excludedSet.has(lead.id);
              const warning =
                alreadyEnrolled
                  ? "Already enrolled in this campaign."
                  : !lead.email
                  ? "No email — sends will be skipped."
                  : lead.emailConsentStatus === "unsubscribed"
                    ? "Unsubscribed — sends will be skipped."
                    : null;

              return (
                <li key={lead.id}>
                  <label
                    className={cn(
                      "flex items-start gap-3 px-3 py-2.5",
                      alreadyEnrolled || selectionDisabled
                        ? "opacity-60 cursor-not-allowed"
                        : "cursor-pointer hover:bg-[var(--color-canvas)]",
                      disabled && "opacity-60 cursor-not-allowed",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      disabled={disabled || selectionDisabled || alreadyEnrolled}
                      onChange={() => toggleSelection(lead.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-[var(--color-ink)]">
                        {lead.fullName}
                      </span>
                      <span className="block text-[11.5px] text-[var(--color-ink-muted)]">
                        {lead.email ?? "No email"}
                        {lead.phone ? ` · ${lead.phone}` : ""}
                      </span>
                      {warning && (
                        <span className="block text-[11px] text-[var(--color-warning)] mt-0.5">
                          {warning}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )
      ) : opportunities.length === 0 ? (
        <p className="text-[12px] text-[var(--color-ink-muted)]">{emptyLabel}</p>
      ) : (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line)]">
          {opportunities.map((opportunity) => {
            const checked = selectedSet.has(opportunity.id);
            const alreadyEnrolled = excludedSet.has(opportunity.id);
            const leadLabel = opportunity.lead?.fullName ?? "Unknown lead";
            const propertyLabel =
              opportunity.property?.title ??
              opportunity.property?.reference ??
              "No property";
            const emailLabel = opportunity.lead?.email ?? "No lead email";

            return (
              <li key={opportunity.id}>
                <label
                  className={cn(
                    "flex items-start gap-3 px-3 py-2.5",
                    alreadyEnrolled || selectionDisabled
                      ? "opacity-60 cursor-not-allowed"
                      : "cursor-pointer hover:bg-[var(--color-canvas)]",
                    disabled && "opacity-60 cursor-not-allowed",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    disabled={disabled || selectionDisabled || alreadyEnrolled}
                    onChange={() => toggleSelection(opportunity.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-[var(--color-ink)]">
                      {leadLabel}
                    </span>
                    <span className="block text-[11.5px] text-[var(--color-ink-muted)]">
                      {propertyLabel}
                      {opportunity.status ? ` · ${opportunity.status.label}` : ""}
                    </span>
                    <span className="block text-[11px] text-[var(--color-ink-muted)]">
                      {emailLabel}
                    </span>
                    {alreadyEnrolled && (
                      <span className="block text-[11px] text-[var(--color-warning)] mt-0.5">
                        Already enrolled in this campaign.
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {selectedIds.length > 0 && (
        <p className="text-[12px] text-[var(--color-ink-muted)]">
          {selectedIds.length} selected
        </p>
      )}
    </div>
  );
}

export function CampaignEnrollmentActions({
  selectedIds,
  onEnroll,
  enrolling,
  disabled,
  error,
}: {
  selectedIds: string[];
  onEnroll: () => void;
  enrolling: boolean;
  disabled?: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        disabled={disabled || enrolling || selectedIds.length === 0}
        onClick={onEnroll}
      >
        {enrolling
          ? "Enrolling…"
          : selectedIds.length > 1
            ? `Enroll ${selectedIds.length} selected`
            : "Enroll selected"}
      </Button>
      {error && (
        <p className="text-[12px] text-[var(--color-danger)]">{error}</p>
      )}
    </div>
  );
}
