"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { OpportunitiesSection } from "@/components/opportunities/opportunities-section";
import { ActivitiesSection } from "@/components/activities/activities-section";
import { DocumentsSection } from "@/components/documents/documents-section";
import { StatusBadge } from "@/components/domain/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { StateView } from "@/components/states/state-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import {
  formatLeadUtmSummary,
  readLeadIntegrationAttributes,
} from "@/lib/lead-integration-attributes";
import {
  labelPropertyTypeInterest,
  labelTransactionIntent,
  labelUsagePurpose,
  type PropertyTypeInterest,
  type TransactionIntent,
  type UsagePurpose,
} from "@/lib/lead-preferences";
import {
  IconCalendar,
  IconMail,
  IconMapPin,
  IconPhone,
  IconSparkles,
} from "@/lib/icons";
import { workspacePath } from "@/lib/workspace-paths";
import { EnrichedField } from "@/components/leads/enriched-field";
import { LeadEnrichmentModal } from "@/components/leads/lead-enrichment-modal";
import { LeadFinancialSituationTab } from "@/components/leads/lead-financial-situation-tab";
import {
  isUniqueEnrichmentReveal,
  readWebEnrichmentAttributes,
  type LeadEnrichmentSuggestion,
} from "@/lib/lead-enrichment";
import type { LeadFieldProvenanceMethod } from "@/lib/lead-intelligence";
import { shouldRequestMarketEstimateAfterEnrichment } from "@/lib/lead-financial-situation";
import type { EnrichmentAppliedRun } from "@/components/leads/lead-enrichment-modal";
import {
  LeadProjectMemberships,
  type LeadProjectMembershipItem,
  type LeadProjectOption,
} from "@/components/leads/lead-project-memberships";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
};

type LeadDetail = {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  language: string | null;
  preferredContactMethod: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  preferredAreas: string[];
  propertyTypeInterests: PropertyTypeInterest[];
  transactionIntent: TransactionIntent | null;
  usagePurpose: UsagePurpose | null;
  notes: string | null;
  createdAt: string;
  archivedAt?: string | null;
  status: DictionaryItem | null;
  source: DictionaryItem | null;
  project: { id: string; name: string; reference: string | null } | null;
  projectMemberships?: LeadProjectMembershipItem[];
  secondaryProjects?: Array<{ id: string; name: string; reference: string | null }>;
  tagsResolved: Array<{ id: string; name: string; color: string }>;
  tags: string[];
  assignedUser: { id: string; name: string | null; email: string } | null;
  statusId: string;
  sourceId: string | null;
  company?: { id: string; name: string } | null;
  industry?: string | null;
  jobTitle?: string | null;
  stateRegion?: string | null;
  city?: string | null;
  country?: string | null;
  professionalProfileUrl?: string | null;
  intelligenceProvenance?: Partial<
    Record<string, { method: LeadFieldProvenanceMethod } | null>
  >;
  attributes?: Record<string, unknown> | null;
  emailConsentStatus?: "unknown" | "subscribed" | "unsubscribed" | null;
};

type LeadDetailPanelProps = {
  workspaceSlug: string;
  leadId: string;
  defaultCurrency: string;
  workspaceTimezone: string;
  canUpdate: boolean;
  canArchive: boolean;
  canReadOpportunities: boolean;
  canCreateOpportunity: boolean;
  canReadActivities: boolean;
  canCreateActivity: boolean;
  canUpdateActivity: boolean;
  canArchiveActivity: boolean;
  canReadDocuments: boolean;
  canCreateDocument: boolean;
  canArchiveDocument: boolean;
  canEnrich: boolean;
  canEnrichRevoke: boolean;
  canFinancialRead: boolean;
  canFinancialUpdate: boolean;
  canFinancialDelete: boolean;
};

export function LeadDetailPanel({
  workspaceSlug,
  leadId,
  defaultCurrency,
  workspaceTimezone,
  canUpdate,
  canArchive,
  canReadOpportunities,
  canCreateOpportunity,
  canReadActivities,
  canCreateActivity,
  canUpdateActivity,
  canArchiveActivity,
  canReadDocuments,
  canCreateDocument,
  canArchiveDocument,
  canEnrich,
  canEnrichRevoke,
  canFinancialRead,
  canFinancialUpdate,
  canFinancialDelete,
}: LeadDetailPanelProps) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [integrationNames, setIntegrationNames] = useState<Record<string, string>>({});
  const [integrationNamesWarning, setIntegrationNamesWarning] = useState<string | null>(null);
  const [projects, setProjects] = useState<LeadProjectOption[]>([]);
  const [memberships, setMemberships] = useState<LeadProjectMembershipItem[]>([]);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [enrichmentRuns, setEnrichmentRuns] = useState<
    Array<{
      id: string;
      status: string;
      suggestions: LeadEnrichmentSuggestion[];
      acceptedSummary: { text: string; citationUrls: string[] } | null;
      summaryDraft: { text: string; citationUrls: string[] } | null;
    }>
  >([]);
  const [enrichmentEnabled, setEnrichmentEnabled] = useState(false);
  const [revealRunId, setRevealRunId] = useState<string | null>(null);
  const [estimatePending, setEstimatePending] = useState(false);
  const [estimateReveal, setEstimateReveal] = useState(false);
  const [financialEstimate, setFinancialEstimate] = useState<{
    rangeMin: number | null;
    rangeMax: number | null;
    currency: string;
    confidencePercent: number;
    disclaimer: string;
    demoMode: boolean;
    jobTitleUsed?: string;
    locationUsed?: string;
    sources?: Array<{ url: string; title: string }>;
  } | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;

  const loadLead = useCallback(async (opts?: { silent?: boolean }): Promise<LeadDetail | null> => {
    if (!opts?.silent) {
      setLoading(true);
    }
    setError(null);
    setForbidden(false);
    setNotFound(false);

    try {
      const response = await fetch(`${apiBase}/leads/${leadId}`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return null;
      }
      if (response.status === 404) {
        setNotFound(true);
        return null;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load lead.");
      }

      const nextLead = payload.data.lead as LeadDetail;
      setLead(nextLead);
      setMemberships(nextLead.projectMemberships ?? []);

      const enrichResponse = await fetch(`${apiBase}/leads/${leadId}/enrichment`);
      if (enrichResponse.ok) {
        const enrichPayload = await enrichResponse.json();
        setEnrichmentEnabled(Boolean(enrichPayload.data?.capability?.enabled));
        setEnrichmentRuns(enrichPayload.data?.runs ?? []);
      }
      return nextLead;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [apiBase, leadId]);

  const loadEstimate = useCallback(async () => {
    if (!canFinancialRead) {
      setFinancialEstimate(null);
      return;
    }
    try {
      const response = await fetch(`${apiBase}/leads/${leadId}/financial-situation`);
      const payload = await response.json();
      if (!response.ok) {
        return;
      }
      const estimate = payload.data?.record?.marketIncomeEstimate;
      setFinancialEstimate(
        estimate
          ? {
              rangeMin: estimate.rangeMin ?? null,
              rangeMax: estimate.rangeMax ?? null,
              currency: estimate.currency,
              confidencePercent: estimate.confidencePercent,
              disclaimer: payload.data?.disclaimer ?? "",
              demoMode:
                estimate.demoMode === true || estimate.searchProvider === "demo_fixture",
              jobTitleUsed: estimate.jobTitleUsed,
              locationUsed: estimate.locationUsed,
              sources: estimate.sources ?? [],
            }
          : null,
      );
    } catch {
      setFinancialEstimate(null);
    }
  }, [apiBase, leadId, canFinancialRead]);

  const handleEnriched = useCallback(
    async (run: EnrichmentAppliedRun) => {
      const unique = isUniqueEnrichmentReveal(run);
      if (unique) {
        setRevealRunId(run.id);
      }
      const nextLead = await loadLead({ silent: true });
      if (
        !unique ||
        !canFinancialUpdate ||
        !nextLead ||
        !shouldRequestMarketEstimateAfterEnrichment({
          uniqueReveal: true,
          jobTitle: nextLead.jobTitle,
          city: nextLead.city,
          stateRegion: nextLead.stateRegion,
          country: nextLead.country,
        })
      ) {
        if (canFinancialRead) {
          await loadEstimate();
        }
        return;
      }
      setEstimatePending(true);
      try {
        const response = await fetch(
          `${apiBase}/leads/${leadId}/financial-situation/market-estimate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          },
        );
        if (response.ok) {
          setEstimateReveal(true);
        }
        await loadEstimate();
      } catch {
        // Occupational search may find no cited numbers; keep the labelled teaser.
      } finally {
        setEstimatePending(false);
      }
    },
    [
      apiBase,
      canFinancialRead,
      canFinancialUpdate,
      leadId,
      loadEstimate,
      loadLead,
    ],
  );

  useEffect(() => {
    void loadLead();
  }, [loadLead]);

  useEffect(() => {
    let cancelled = false;

    async function loadIntegrations() {
      setIntegrationNamesWarning(null);

      try {
        const response = await fetch(`${apiBase}/integrations?type=website`);
        const payload = await response.json();
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setIntegrationNames({});
          setIntegrationNamesWarning(
            response.status === 403
              ? "Website names unavailable — requires settings:read. Showing integration id when present."
              : "Could not resolve website integration names.",
          );
          return;
        }

        const next: Record<string, string> = {};
        for (const integration of payload.data.integrations as Array<{
          id: string;
          name: string;
        }>) {
          next[integration.id] = integration.name;
        }
        setIntegrationNames(next);
      } catch {
        if (!cancelled) {
          setIntegrationNamesWarning("Could not resolve website integration names.");
        }
      }
    }

    void loadIntegrations();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        const response = await fetch(`${apiBase}/projects`);
        const payload = await response.json();
        if (cancelled || !response.ok) {
          return;
        }
        setProjects((payload.data?.projects ?? []) as LeadProjectOption[]);
      } catch {
        if (!cancelled) {
          setProjects([]);
        }
      }
    }

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  useEffect(() => {
    void loadEstimate();
  }, [loadEstimate]);

  async function mutateMemberships(
    path: string,
    init: RequestInit,
  ): Promise<LeadProjectMembershipItem[]> {
    const response = await fetch(path, init);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Failed to update project memberships.");
    }
    const next = (payload.data?.memberships ?? []) as LeadProjectMembershipItem[];
    setMemberships(next);
    setMembershipError(null);
    await loadLead();
    return next;
  }

  async function handleArchive() {
    if (!lead || !canArchive || lead.archivedAt) {
      return;
    }
    if (!window.confirm(`Archive lead "${lead.fullName}"?`)) {
      return;
    }

    const response = await fetch(`${apiBase}/leads/${leadId}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      window.alert(body.error?.message ?? "Failed to archive lead.");
      return;
    }

    window.location.href = workspacePath(workspaceSlug, "leads");
  }

  async function handleRestore() {
    if (!lead || !canArchive || !lead.archivedAt) {
      return;
    }

    const response = await fetch(`${apiBase}/leads/${leadId}/restore`, {
      method: "POST",
    });
    if (!response.ok) {
      const body = await response.json();
      window.alert(body.error?.message ?? "Failed to restore lead.");
      return;
    }

    await loadLead();
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatBudget(min: number | null, max: number | null) {
    if (min === null && max === null) {
      return "—";
    }
    if (min !== null && max !== null) {
      return `${min.toLocaleString()} – ${max.toLocaleString()}`;
    }
    return (min ?? max)?.toLocaleString() ?? "—";
  }

  const activeRun =
    enrichmentRuns.find((run) => run.status === "accepted" || run.status === "reviewing") ??
    enrichmentRuns[0] ??
    null;
  const revealing = Boolean(revealRunId);

  function suggestionFor(fieldKey: string) {
    return activeRun?.suggestions.find((item) => item.fieldKey === fieldKey) ?? null;
  }

  function canClearSuggestion(suggestion: LeadEnrichmentSuggestion | null) {
    return Boolean(
      canEnrich &&
        suggestion &&
        (suggestion.status === "accepted" || suggestion.status === "edited"),
    );
  }

  function canOverwriteSuggestion(suggestion: LeadEnrichmentSuggestion | null) {
    return Boolean(canEnrich && suggestion && suggestion.status === "proposed");
  }

  async function clearSuggestion(suggestion: LeadEnrichmentSuggestion) {
    if (!activeRun) return;
    await fetch(`${apiBase}/leads/${leadId}/enrichment/${activeRun.id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decisions: [{ suggestionId: suggestion.id, action: "clear" }],
      }),
    });
    await loadLead({ silent: true });
  }

  async function applyOverwrite(suggestion: LeadEnrichmentSuggestion) {
    if (!activeRun) return;
    await fetch(`${apiBase}/leads/${leadId}/enrichment/${activeRun.id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decisions: [
          {
            suggestionId: suggestion.id,
            action: "accept",
            overwriteAcknowledged: true,
          },
        ],
      }),
    });
    await loadLead({ silent: true });
  }

  async function editSuggestion(suggestion: LeadEnrichmentSuggestion, next: string) {
    if (!activeRun) return;
    await fetch(`${apiBase}/leads/${leadId}/enrichment/${activeRun.id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decisions: [
          {
            suggestionId: suggestion.id,
            action: "edit",
            editedValue: next,
          },
        ],
      }),
    });
    await loadLead({ silent: true });
  }

  async function revertActiveRun() {
    if (!activeRun) return;
    if (!window.confirm("Revert this enrichment run and restore previous CRM values?")) {
      return;
    }
    await fetch(`${apiBase}/leads/${leadId}/enrichment/${activeRun.id}/revert`, {
      method: "POST",
    });
    setRevealRunId(null);
    setEstimateReveal(false);
    await loadLead({ silent: true });
  }

  async function revokeEnrichment() {
    if (!window.confirm("Delete all enrichment data for this lead?")) {
      return;
    }
    await fetch(`${apiBase}/leads/${leadId}/enrichment`, { method: "DELETE" });
    setRevealRunId(null);
    setEstimateReveal(false);
    await loadLead({ silent: true });
  }

  if (forbidden) {
    return (
      <PermissionDenied
        title="Lead unavailable"
        description="You do not have permission to view this lead."
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (notFound) {
    return (
      <StateView
        variant="empty"
        title="Lead not found"
        description="This lead does not exist in this workspace or may have been archived."
        primaryAction={{
          label: "Back to leads",
          onClick: () => {
            window.location.href = workspacePath(workspaceSlug, "leads");
          },
        }}
      />
    );
  }

  if (error || !lead) {
    return (
      <ErrorState
        title="Could not load lead"
        description={error ?? "Failed to load lead."}
        primaryAction={{ label: "Retry", onClick: () => void loadLead() }}
      />
    );
  }

  const initials = lead.fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const integrationAttrs = readLeadIntegrationAttributes(lead.attributes);
  const enrichmentOverlay = readWebEnrichmentAttributes(lead.attributes);
  const websiteName = integrationAttrs?.integrationId
    ? (integrationNames[integrationAttrs.integrationId] ?? integrationAttrs.integrationId)
    : null;

  return (
    <>
      <PageHeader
        back={{
          href: workspacePath(workspaceSlug, "leads"),
          label: "Back to leads",
        }}
        title={
          <span className="flex items-center gap-2.5 flex-wrap">
            {lead.fullName}
            {lead.status && (
              <StatusBadge
                label={lead.status.label}
                color={lead.status.color}
                size="sm"
              />
            )}
          </span>
        }
        description={`${lead.source?.label ?? "No source"} · Created ${formatDate(lead.createdAt)}${
          lead.archivedAt ? " · Archived" : ""
        }`}
        actions={
          <>
            {canEnrich && enrichmentEnabled && !lead.archivedAt && (
              <Button
                variant="outline"
                leadingIcon={<IconSparkles size={14} />}
                onClick={() => {
                  setRevealRunId(null);
                  setEstimateReveal(false);
                  setEnrichOpen(true);
                }}
              >
                Enrich
              </Button>
            )}
            {canUpdate && !lead.archivedAt && (
              <Link href={workspacePath(workspaceSlug, "leads", leadId, "edit")}>
                <Button variant="secondary">Edit</Button>
              </Link>
            )}
            {canArchive && lead.archivedAt ? (
              <Button onClick={() => void handleRestore()}>Restore</Button>
            ) : null}
            {canArchive && !lead.archivedAt ? (
              <Button variant="ghost" onClick={() => void handleArchive()}>
                Archive
              </Button>
            ) : null}
          </>
        }
      />

      {lead.archivedAt ? (
        <p className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-4 py-3 text-[13px] text-[var(--color-ink-muted)]">
          This lead is <strong className="text-[var(--color-ink)]">archived</strong>. Restore it to
          edit or use it in new opportunities.
        </p>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-1">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)] text-[14px] font-semibold">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-[var(--color-ink)] truncate">
                {lead.fullName}
              </p>
              <p className="text-[12.5px] text-[var(--color-ink-muted)]">Lead · {lead.id}</p>
            </div>
          </div>

          <div className="mt-5 space-y-2.5 text-[13px]">
            <Row icon={<IconMail size={14} />} label="Email">
              {lead.email ? (
                <a
                  className="text-[var(--color-brand-700)] hover:underline truncate"
                  href={`mailto:${lead.email}`}
                >
                  {lead.email}
                </a>
              ) : (
                "—"
              )}
            </Row>
            <Row icon={<IconPhone size={14} />} label="Phone">
              {lead.phone ?? "—"}
            </Row>
            <Row icon={<IconMapPin size={14} />} label="Company">
              <EnrichedField
                value={lead.company?.name ?? "—"}
                origin={lead.intelligenceProvenance?.companyId?.method}
                suggestion={suggestionFor("companyName")}
                reveal={revealing}
                onClear={
                  canClearSuggestion(suggestionFor("companyName"))
                    ? () => void clearSuggestion(suggestionFor("companyName")!)
                    : undefined
                }
                onApplyOverwrite={
                  canOverwriteSuggestion(suggestionFor("companyName"))
                    ? () => void applyOverwrite(suggestionFor("companyName")!)
                    : undefined
                }
                onEdit={
                  canClearSuggestion(suggestionFor("companyName"))
                    ? (next) => void editSuggestion(suggestionFor("companyName")!, next)
                    : undefined
                }
              />
            </Row>
            <Row icon={<IconMapPin size={14} />} label="Job title">
              <EnrichedField
                value={lead.jobTitle ?? "—"}
                origin={lead.intelligenceProvenance?.jobTitle?.method}
                suggestion={suggestionFor("jobTitle")}
                reveal={revealing}
                onClear={
                  canClearSuggestion(suggestionFor("jobTitle"))
                    ? () => void clearSuggestion(suggestionFor("jobTitle")!)
                    : undefined
                }
                onApplyOverwrite={
                  canOverwriteSuggestion(suggestionFor("jobTitle"))
                    ? () => void applyOverwrite(suggestionFor("jobTitle")!)
                    : undefined
                }
                onEdit={
                  canClearSuggestion(suggestionFor("jobTitle"))
                    ? (next) => void editSuggestion(suggestionFor("jobTitle")!, next)
                    : undefined
                }
              />
            </Row>
            <Row icon={<IconMapPin size={14} />} label="Preferred areas">
              {lead.preferredAreas.length > 0 ? lead.preferredAreas.join(", ") : "—"}
            </Row>
            <Row icon={<IconCalendar size={14} />} label="Created">
              {formatDate(lead.createdAt)}
            </Row>
          </div>

          <div className="border-t border-[var(--color-line)] my-5" />

          <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-3">
            Assigned to
          </p>
          <p className="text-[13px] text-[var(--color-ink)]">
            {lead.assignedUser?.name ?? lead.assignedUser?.email ?? "Unassigned"}
          </p>

          {lead.tagsResolved.length > 0 && (
            <>
              <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mt-5 mb-2">
                Tags
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {lead.tagsResolved.map((tag) => (
                  <Badge key={tag.id} tone="muted">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </>
          )}

          {lead.notes && (
            <>
              <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mt-5 mb-2">
                Notes
              </p>
              <p className="text-[13px] text-[var(--color-ink-soft)] whitespace-pre-wrap">
                {lead.notes}
              </p>
            </>
          )}
        </Card>

        <div className="xl:col-span-2">
          <Card padded={false}>
            <Tabs
              className="px-5"
              items={[
                {
                  key: "overview",
                  label: "Overview",
                  content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-5 px-5">
                      <Info label="Budget" value={formatBudget(lead.budgetMin, lead.budgetMax)} />
                      <Info label="Language" value={lead.language ?? "—"} />
                      <Info
                        label="Preferred contact"
                        value={lead.preferredContactMethod ?? "—"}
                      />
                      <Info
                        label="Preferred areas"
                        value={
                          lead.preferredAreas.length > 0
                            ? lead.preferredAreas.join(", ")
                            : "—"
                        }
                      />
                      <Info label="Source" value={lead.source?.label ?? "—"} />
                      <Info
                        label="Industry"
                        value={lead.industry ?? "—"}
                        origin={lead.intelligenceProvenance?.industry?.method}
                        reveal={revealing}
                        suggestion={suggestionFor("industry")}
                        onClear={
                          canClearSuggestion(suggestionFor("industry"))
                            ? () => void clearSuggestion(suggestionFor("industry")!)
                            : undefined
                        }
                        onApplyOverwrite={
                          canOverwriteSuggestion(suggestionFor("industry"))
                            ? () => void applyOverwrite(suggestionFor("industry")!)
                            : undefined
                        }
                        onEdit={
                          canClearSuggestion(suggestionFor("industry"))
                            ? (next) => void editSuggestion(suggestionFor("industry")!, next)
                            : undefined
                        }
                      />
                      <Info
                        label="State / region"
                        value={lead.stateRegion ?? "—"}
                        origin={lead.intelligenceProvenance?.stateRegion?.method}
                        reveal={revealing}
                        suggestion={suggestionFor("stateRegion")}
                        onClear={
                          canClearSuggestion(suggestionFor("stateRegion"))
                            ? () => void clearSuggestion(suggestionFor("stateRegion")!)
                            : undefined
                        }
                        onApplyOverwrite={
                          canOverwriteSuggestion(suggestionFor("stateRegion"))
                            ? () => void applyOverwrite(suggestionFor("stateRegion")!)
                            : undefined
                        }
                        onEdit={
                          canClearSuggestion(suggestionFor("stateRegion"))
                            ? (next) => void editSuggestion(suggestionFor("stateRegion")!, next)
                            : undefined
                        }
                      />
                      <Info
                        label="City"
                        value={lead.city ?? "—"}
                        origin={lead.intelligenceProvenance?.city?.method}
                        reveal={revealing}
                        suggestion={suggestionFor("city")}
                        onClear={
                          canClearSuggestion(suggestionFor("city"))
                            ? () => void clearSuggestion(suggestionFor("city")!)
                            : undefined
                        }
                        onApplyOverwrite={
                          canOverwriteSuggestion(suggestionFor("city"))
                            ? () => void applyOverwrite(suggestionFor("city")!)
                            : undefined
                        }
                        onEdit={
                          canClearSuggestion(suggestionFor("city"))
                            ? (next) => void editSuggestion(suggestionFor("city")!, next)
                            : undefined
                        }
                      />
                      <Info
                        label="Country"
                        value={lead.country ?? "—"}
                        origin={lead.intelligenceProvenance?.country?.method}
                        reveal={revealing}
                        suggestion={suggestionFor("country")}
                        onClear={
                          canClearSuggestion(suggestionFor("country"))
                            ? () => void clearSuggestion(suggestionFor("country")!)
                            : undefined
                        }
                        onApplyOverwrite={
                          canOverwriteSuggestion(suggestionFor("country"))
                            ? () => void applyOverwrite(suggestionFor("country")!)
                            : undefined
                        }
                        onEdit={
                          canClearSuggestion(suggestionFor("country"))
                            ? (next) => void editSuggestion(suggestionFor("country")!, next)
                            : undefined
                        }
                      />
                      <Info
                        label="Professional profile"
                        value={lead.professionalProfileUrl ?? "—"}
                        origin={lead.intelligenceProvenance?.professionalProfileUrl?.method}
                        reveal={revealing}
                        suggestion={suggestionFor("professionalProfileUrl")}
                        onClear={
                          canClearSuggestion(suggestionFor("professionalProfileUrl"))
                            ? () =>
                                void clearSuggestion(suggestionFor("professionalProfileUrl")!)
                            : undefined
                        }
                        onEdit={
                          canClearSuggestion(suggestionFor("professionalProfileUrl"))
                            ? (next) =>
                                void editSuggestion(
                                  suggestionFor("professionalProfileUrl")!,
                                  next,
                                )
                            : undefined
                        }
                      />
                      <Info
                        label="Preferred contact clues"
                        value={enrichmentOverlay.preferredContactClues ?? lead.preferredContactMethod ?? "—"}
                        origin={
                          enrichmentOverlay.preferredContactClues ? "enrichment" : undefined
                        }
                        reveal={revealing}
                        suggestion={suggestionFor("preferredContactClues")}
                        onClear={
                          canClearSuggestion(suggestionFor("preferredContactClues"))
                            ? () => void clearSuggestion(suggestionFor("preferredContactClues")!)
                            : undefined
                        }
                        onEdit={
                          canClearSuggestion(suggestionFor("preferredContactClues"))
                            ? (next) =>
                                void editSuggestion(
                                  suggestionFor("preferredContactClues")!,
                                  next,
                                )
                            : undefined
                        }
                      />
                      <div className="md:col-span-2">
                        <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-2">
                          Projects
                        </p>
                        {membershipError ? (
                          <p className="mb-2 text-[12px] text-[var(--color-danger-fg)]">
                            {membershipError}
                          </p>
                        ) : null}
                        <LeadProjectMemberships
                          memberships={
                            memberships.length > 0
                              ? memberships
                              : lead.project
                                ? [
                                    {
                                      id: lead.project.id,
                                      projectId: lead.project.id,
                                      isPrimary: true,
                                      sourceOrder: 0,
                                      project: lead.project,
                                    },
                                  ]
                                : []
                          }
                          projects={projects}
                          canUpdate={canUpdate && !lead.archivedAt}
                          onAdd={async (projectId, isPrimary) => {
                            try {
                              await mutateMemberships(
                                `${apiBase}/leads/${leadId}/project-memberships`,
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ projectId, isPrimary }),
                                },
                              );
                            } catch (error) {
                              setMembershipError(
                                error instanceof Error
                                  ? error.message
                                  : "Failed to add project.",
                              );
                            }
                          }}
                          onRemove={async (membershipId) => {
                            try {
                              await mutateMemberships(
                                `${apiBase}/leads/${leadId}/project-memberships/${membershipId}`,
                                { method: "DELETE" },
                              );
                            } catch (error) {
                              setMembershipError(
                                error instanceof Error
                                  ? error.message
                                  : "Failed to remove project.",
                              );
                            }
                          }}
                          onSetPrimary={async (membershipId) => {
                            try {
                              await mutateMemberships(
                                `${apiBase}/leads/${leadId}/project-memberships/${membershipId}`,
                                {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ isPrimary: true }),
                                },
                              );
                            } catch (error) {
                              setMembershipError(
                                error instanceof Error
                                  ? error.message
                                  : "Failed to change primary project.",
                              );
                            }
                          }}
                          onReorder={async (membershipIds) => {
                            try {
                              await mutateMemberships(
                                `${apiBase}/leads/${leadId}/project-memberships/reorder`,
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ membershipIds }),
                                },
                              );
                            } catch (error) {
                              setMembershipError(
                                error instanceof Error
                                  ? error.message
                                  : "Failed to reorder projects.",
                              );
                            }
                          }}
                        />
                      </div>
                      <Info label="Status" value={lead.status?.label ?? "—"} />
                      <Info
                        label="Email consent"
                        value={lead.emailConsentStatus ?? "unknown"}
                      />
                      <Info
                        label="Property type interests"
                        value={
                          lead.propertyTypeInterests.length > 0
                            ? lead.propertyTypeInterests
                                .map((interest) => labelPropertyTypeInterest(interest))
                                .join(", ")
                            : "—"
                        }
                      />
                      <Info
                        label="Transaction intent"
                        value={
                          lead.transactionIntent
                            ? labelTransactionIntent(lead.transactionIntent)
                            : "—"
                        }
                      />
                      <Info
                        label="Usage purpose"
                        value={
                          lead.usagePurpose ? labelUsagePurpose(lead.usagePurpose) : "—"
                        }
                      />
                      {enrichmentOverlay.otherProfessional ? (
                        <Info
                          label="Other public professional information"
                          value={enrichmentOverlay.otherProfessional}
                          origin="enrichment"
                          reveal={revealing}
                          suggestion={suggestionFor("otherProfessional")}
                          onClear={
                          canClearSuggestion(suggestionFor("otherProfessional"))
                              ? () => void clearSuggestion(suggestionFor("otherProfessional")!)
                              : undefined
                          }
                          onEdit={
                            canClearSuggestion(suggestionFor("otherProfessional"))
                              ? (next) =>
                                  void editSuggestion(
                                    suggestionFor("otherProfessional")!,
                                    next,
                                  )
                              : undefined
                          }
                        />
                      ) : null}
                      {enrichmentOverlay.summary?.text ? (
                        <div
                          className={
                            revealing
                              ? "enrich-reveal md:col-span-2 rounded-lg border border-[var(--color-enrich-border)] bg-[var(--color-enrich-bg)]/50 p-3"
                              : "md:col-span-2 rounded-lg border border-[var(--color-enrich-border)] bg-[var(--color-enrich-bg)]/50 p-3"
                          }
                        >
                          <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-enrich-fg)] font-semibold mb-1">
                            What we know
                          </p>
                          <p className="text-[13px] text-[var(--color-ink-soft)] whitespace-pre-wrap">
                            {enrichmentOverlay.summary.text}
                          </p>
                          {enrichmentOverlay.summary.citationUrls?.length ? (
                            <ul className="mt-2 text-[12px] space-y-0.5">
                              {enrichmentOverlay.summary.citationUrls.map((url) => (
                                <li key={url}>
                                  <a
                                    className="text-[var(--color-brand-700)] hover:underline break-all"
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {url}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {canEnrich && activeRun ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button variant="ghost" onClick={() => void revertActiveRun()}>
                                Revert this enrichment
                              </Button>
                              {canEnrichRevoke ? (
                                <Button variant="ghost" onClick={() => void revokeEnrichment()}>
                                  Delete enrichment data
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {canFinancialRead && financialEstimate ? (
                        <div
                          className={
                            estimateReveal
                              ? "enrich-reveal md:col-span-2 rounded-lg border border-dashed border-[var(--color-enrich-border)] bg-[var(--color-enrich-bg)]/30 p-3"
                              : "md:col-span-2 rounded-lg border border-dashed border-[var(--color-line-strong)] bg-[var(--color-canvas)] p-3"
                          }
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-enrich-fg)] font-semibold">
                              AI occupational estimate — not a declared figure
                            </p>
                            <Badge tone="enrich" size="sm">
                              Estimate
                            </Badge>
                          </div>
                          {financialEstimate.demoMode ? (
                            <p className="mb-1 text-[12.5px] text-[var(--color-warn-fg)]">
                              Demo fixture — not live market data and not this person’s income.
                            </p>
                          ) : null}
                          <p className="text-[13.5px] text-[var(--color-ink)] tabular">
                            {financialEstimate.rangeMin?.toLocaleString() ?? "—"} –{" "}
                            {financialEstimate.rangeMax?.toLocaleString() ?? "—"}{" "}
                            {financialEstimate.currency} ({financialEstimate.confidencePercent}%
                            source confidence)
                          </p>
                          {financialEstimate.jobTitleUsed || financialEstimate.locationUsed ? (
                            <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
                              Based on {financialEstimate.jobTitleUsed ?? "job"}
                              {financialEstimate.locationUsed
                                ? ` · ${financialEstimate.locationUsed}`
                                : ""}
                              . Separate from any user-entered income on the Financial situation
                              tab.
                            </p>
                          ) : null}
                          {financialEstimate.sources && financialEstimate.sources.length > 0 ? (
                            <ul className="mt-2 text-[12px] space-y-0.5">
                              {financialEstimate.sources.map((source) => (
                                <li key={source.url}>
                                  <a
                                    className="text-[var(--color-brand-700)] hover:underline break-all"
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {source.title || source.url}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
                            {financialEstimate.disclaimer}
                          </p>
                        </div>
                      ) : canFinancialRead && estimatePending ? (
                        <p className="md:col-span-2 text-[12.5px] text-[var(--color-ink-muted)]">
                          Requesting labelled occupational estimate (job and location only)…
                        </p>
                      ) : canFinancialRead &&
                        lead.jobTitle &&
                        (lead.city || lead.stateRegion || lead.country) ? (
                        <p className="md:col-span-2 text-[12.5px] text-[var(--color-ink-muted)]">
                          Optional occupational estimate can pre-fill working figures on the
                          Financial situation tab so a broker can gauge affordability. Human-declared
                          numbers are left alone. Not an automated credit or mortgage decision.
                        </p>
                      ) : null}
                      {integrationAttrs && (
                        <>
                          <div className="md:col-span-2 border-t border-[var(--color-line)] pt-4">
                            <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-3">
                              Website attribution
                            </p>
                            {integrationNamesWarning && (
                              <p className="text-[12px] text-[var(--color-ink-muted)] mb-3">
                                {integrationNamesWarning}
                              </p>
                            )}
                          </div>
                          <Info label="Website integration" value={websiteName ?? "—"} />
                          <Info
                            label="Inbound source"
                            value={integrationAttrs.inboundSource ?? "—"}
                          />
                          <Info
                            label="Campaign / UTM"
                            value={formatLeadUtmSummary(integrationAttrs.utm)}
                          />
                          <Info
                            label="Property reference"
                            value={integrationAttrs.propertyReference ?? "—"}
                          />
                          <Info
                            label="External ID"
                            value={integrationAttrs.externalId ?? "—"}
                          />
                          <Info
                            label="Idempotency key"
                            value={integrationAttrs.idempotencyKey ?? "—"}
                          />
                        </>
                      )}
                    </div>
                  ),
                },
                {
                  key: "opps",
                  label: "Opportunities",
                  content: (
                    <OpportunitiesSection
                      workspaceSlug={workspaceSlug}
                      defaultCurrency={defaultCurrency}
                      leadId={leadId}
                      canRead={canReadOpportunities}
                      canCreate={canCreateOpportunity}
                    />
                  ),
                },
                {
                  key: "acts",
                  label: "Activities",
                  content: (
                    <ActivitiesSection
                      workspaceSlug={workspaceSlug}
                      workspaceTimezone={workspaceTimezone}
                      leadId={leadId}
                      canRead={canReadActivities}
                      canCreate={canCreateActivity}
                      canUpdate={canUpdateActivity}
                      canArchive={canArchiveActivity}
                      compact
                    />
                  ),
                },
                ...(canFinancialRead
                  ? [
                      {
                        key: "financial",
                        label: "Financial situation",
                        content: (
                          <LeadFinancialSituationTab
                            workspaceSlug={workspaceSlug}
                            leadId={leadId}
                            canUpdate={canFinancialUpdate && !lead.archivedAt}
                            canDelete={canFinancialDelete && !lead.archivedAt}
                          />
                        ),
                      },
                    ]
                  : []),
                {
                  key: "notes",
                  label: "Notes",
                  content: (
                    <div className="px-5 pb-5">
                      <StateView
                        variant="empty"
                        compact
                        title="Timeline notes coming soon"
                        description="Use the internal notes field on the lead record for now. Persisted timeline notes arrive in a later phase."
                      />
                    </div>
                  ),
                },
                {
                  key: "files",
                  label: "Files",
                  content: (
                    <DocumentsSection
                      workspaceSlug={workspaceSlug}
                      linkedEntityType="lead"
                      linkedEntityId={leadId}
                      canRead={canReadDocuments}
                      canCreate={canCreateDocument}
                      canArchive={canArchiveDocument}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </div>

      <LeadEnrichmentModal
        open={enrichOpen}
        onClose={() => setEnrichOpen(false)}
        workspaceSlug={workspaceSlug}
        leadId={leadId}
        onApplied={(run) => void handleEnriched(run)}
      />
    </>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-[var(--color-ink-muted)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-faint)] font-semibold">
          {label}
        </p>
        <div className="text-[13px] text-[var(--color-ink)]">{children}</div>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  origin,
  suggestion,
  reveal,
  onClear,
  onApplyOverwrite,
  onEdit,
}: {
  label: string;
  value: string;
  origin?: LeadFieldProvenanceMethod | "unknown" | null;
  suggestion?: LeadEnrichmentSuggestion | null;
  reveal?: boolean;
  onClear?: () => void;
  onApplyOverwrite?: () => void;
  onEdit?: (next: string) => void;
}) {
  return (
    <div>
      <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-1">
        {label}
      </p>
      <EnrichedField
        value={value}
        origin={origin}
        suggestion={suggestion}
        reveal={reveal}
        onClear={onClear}
        onApplyOverwrite={onApplyOverwrite}
        onEdit={onEdit}
      />
    </div>
  );
}
