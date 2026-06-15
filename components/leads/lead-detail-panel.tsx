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
} from "@/lib/icons";
import { workspacePath } from "@/lib/workspace-paths";

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
  status: DictionaryItem | null;
  source: DictionaryItem | null;
  project: { id: string; name: string; reference: string | null } | null;
  tagsResolved: Array<{ id: string; name: string; color: string }>;
  tags: string[];
  assignedUser: { id: string; name: string | null; email: string } | null;
  statusId: string;
  sourceId: string | null;
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
}: LeadDetailPanelProps) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const apiBase = `/api/workspaces/${workspaceSlug}`;

  const loadLead = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    setNotFound(false);

    try {
      const response = await fetch(`${apiBase}/leads/${leadId}`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load lead.");
      }

      setLead(payload.data.lead as LeadDetail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, leadId]);

  useEffect(() => {
    void loadLead();
  }, [loadLead]);

  async function handleArchive() {
    if (!lead || !canArchive) {
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
        description={`${lead.source?.label ?? "No source"} · Created ${formatDate(lead.createdAt)}`}
        actions={
          <>
            {canUpdate && (
              <Link href={workspacePath(workspaceSlug, "leads", leadId, "edit")}>
                <Button variant="secondary">Edit</Button>
              </Link>
            )}
            {canArchive && (
              <Button variant="ghost" onClick={() => void handleArchive()}>
                Archive
              </Button>
            )}
          </>
        }
      />

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
                        label="Project"
                        value={
                          lead.project
                            ? lead.project.reference
                              ? `${lead.project.name} (${lead.project.reference})`
                              : lead.project.name
                            : "—"
                        }
                      />
                      <Info label="Status" value={lead.status?.label ?? "—"} />
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
        <p className="text-[13px] text-[var(--color-ink)] truncate">{children}</p>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-1">
        {label}
      </p>
      <p className="text-[13.5px] text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
