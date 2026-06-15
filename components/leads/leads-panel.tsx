"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { StatusBadge } from "@/components/domain/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Select } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PROPERTY_TYPE_INTERESTS,
  PROPERTY_TYPE_INTEREST_LABELS,
  TRANSACTION_INTENTS,
  TRANSACTION_INTENT_LABELS,
  USAGE_PURPOSES,
  USAGE_PURPOSE_LABELS,
} from "@/lib/lead-preferences";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@/lib/icons";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
  isDefault?: boolean;
};

type LeadListItem = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  status: DictionaryItem | null;
  source: DictionaryItem | null;
  tagsResolved: Array<{ id: string; name: string; color: string }>;
  assignedUser: { id: string; name: string | null; email: string } | null;
};

type LeadsPanelProps = {
  workspaceSlug: string;
  canCreate: boolean;
  canArchive: boolean;
};

export function LeadsPanel({
  workspaceSlug,
  canCreate,
  canArchive,
}: LeadsPanelProps) {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [propertyTypeInterestFilter, setPropertyTypeInterestFilter] = useState("");
  const [transactionIntentFilter, setTransactionIntentFilter] = useState("");
  const [usagePurposeFilter, setUsagePurposeFilter] = useState("");
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [sources, setSources] = useState<DictionaryItem[]>([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadOptions = useCallback(async () => {
    try {
      const [statusRes, sourceRes, tagsRes] = await Promise.all([
        fetch(`${apiBase}/dictionary-items?type=lead_status`),
        fetch(`${apiBase}/dictionary-items?type=lead_source`),
        fetch(`${apiBase}/tags?entityType=lead`),
      ]);

      const [statusPayload, sourcePayload, tagsPayload] = await Promise.all([
        statusRes.json(),
        sourceRes.json(),
        tagsRes.json(),
      ]);

      if (statusRes.ok) {
        setStatuses(statusPayload.data.items as DictionaryItem[]);
      }
      if (sourceRes.ok) {
        setSources(sourcePayload.data.items as DictionaryItem[]);
      }
      if (tagsRes.ok) {
        setTags(tagsPayload.data.tags as Array<{ id: string; name: string }>);
      }
    } catch {
      // Options are non-blocking for list view.
    }
  }, [apiBase]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) {
        params.set("search", search.trim());
      }
      if (statusFilter) {
        params.set("statusId", statusFilter);
      }
      if (sourceFilter) {
        params.set("sourceId", sourceFilter);
      }
      if (tagFilter) {
        params.set("tagId", tagFilter);
      }
      if (propertyTypeInterestFilter) {
        params.set("propertyTypeInterest", propertyTypeInterestFilter);
      }
      if (transactionIntentFilter) {
        params.set("transactionIntent", transactionIntentFilter);
      }
      if (usagePurposeFilter) {
        params.set("usagePurpose", usagePurposeFilter);
      }

      const response = await fetch(`${apiBase}/leads?${params.toString()}`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load leads.");
      }

      setLeads(payload.data as LeadListItem[]);
      setTotal(payload.pagination?.total ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [
    apiBase,
    page,
    pageSize,
    propertyTypeInterestFilter,
    search,
    sourceFilter,
    statusFilter,
    tagFilter,
    transactionIntentFilter,
    usagePurposeFilter,
  ]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  async function handleArchive(leadId: string, leadName: string) {
    if (!canArchive) {
      return;
    }
    if (!window.confirm(`Archive lead "${leadName}"?`)) {
      return;
    }

    const response = await fetch(`${apiBase}/leads/${leadId}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      window.alert(body.error?.message ?? "Failed to archive lead.");
      return;
    }

    await loadLeads();
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  if (forbidden) {
    return (
      <PermissionDenied
        title="Leads unavailable"
        description="You do not have permission to view leads."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Leads"
        description="Every contact entering your workspace. Convert qualified leads into opportunities."
        meta={
          !loading ? (
            <Badge tone="muted" size="sm">
              {total} total
            </Badge>
          ) : undefined
        }
        actions={
          canCreate ? (
            <Button
              leadingIcon={<IconPlus size={14} />}
              onClick={() => router.push(workspacePath(workspaceSlug, "leads", "new"))}
            >
              New lead
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] max-w-md">
          <Input
            placeholder="Search leads by name, email or phone…"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            fieldSize="sm"
          />
        </div>
        <Select
          fieldSize="sm"
          className="w-auto min-w-[140px]"
          value={statusFilter}
          onChange={(event) => {
            setPage(1);
            setStatusFilter(event.target.value);
          }}
        >
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.label}
            </option>
          ))}
        </Select>
        <Select
          fieldSize="sm"
          className="w-auto min-w-[140px]"
          value={sourceFilter}
          onChange={(event) => {
            setPage(1);
            setSourceFilter(event.target.value);
          }}
        >
          <option value="">All sources</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
            </option>
          ))}
        </Select>
        <Select
          fieldSize="sm"
          className="w-auto min-w-[140px]"
          value={tagFilter}
          onChange={(event) => {
            setPage(1);
            setTagFilter(event.target.value);
          }}
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </Select>
        <Select
          fieldSize="sm"
          className="w-auto min-w-[160px]"
          value={propertyTypeInterestFilter}
          onChange={(event) => {
            setPage(1);
            setPropertyTypeInterestFilter(event.target.value);
          }}
        >
          <option value="">All property types</option>
          {PROPERTY_TYPE_INTERESTS.map((value) => (
            <option key={value} value={value}>
              {PROPERTY_TYPE_INTEREST_LABELS[value]}
            </option>
          ))}
        </Select>
        <Select
          fieldSize="sm"
          className="w-auto min-w-[140px]"
          value={transactionIntentFilter}
          onChange={(event) => {
            setPage(1);
            setTransactionIntentFilter(event.target.value);
          }}
        >
          <option value="">All intents</option>
          {TRANSACTION_INTENTS.map((value) => (
            <option key={value} value={value}>
              {TRANSACTION_INTENT_LABELS[value]}
            </option>
          ))}
        </Select>
        <Select
          fieldSize="sm"
          className="w-auto min-w-[150px]"
          value={usagePurposeFilter}
          onChange={(event) => {
            setPage(1);
            setUsagePurposeFilter(event.target.value);
          }}
        >
          <option value="">All usage purposes</option>
          {USAGE_PURPOSES.map((value) => (
            <option key={value} value={value}>
              {USAGE_PURPOSE_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <ErrorState title="Could not load leads" description={error} primaryAction={{ label: "Retry", onClick: () => void loadLeads() }} />
      ) : leads.length === 0 ? (
        <EmptyState
          title="No leads yet"
          description="Create your first lead to start capturing demand in this workspace."
          primaryAction={
            canCreate
              ? {
                  label: "New lead",
                  onClick: () => router.push(workspacePath(workspaceSlug, "leads", "new")),
                }
              : undefined
          }
        />
      ) : (
        <div className="bg-white border border-[var(--color-line)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead>
                <tr className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] bg-[var(--color-canvas)] border-b border-[var(--color-line)]">
                  <th className="text-left font-semibold px-5 py-3">Name</th>
                  <th className="text-left font-semibold px-2 py-3">Source</th>
                  <th className="text-left font-semibold px-2 py-3">Status</th>
                  <th className="text-left font-semibold px-2 py-3">Assigned to</th>
                  <th className="text-left font-semibold px-2 py-3">Created</th>
                  <th className="text-left font-semibold px-2 py-3">Tags</th>
                  <th className="text-right font-semibold px-5 py-3 w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-[var(--color-canvas)] transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={workspacePath(workspaceSlug, "leads", lead.id)}
                        className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
                      >
                        {lead.fullName}
                      </Link>
                      {lead.email && (
                        <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5">
                          {lead.email}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-3.5 text-[var(--color-ink-soft)]">
                      {lead.source?.label ?? "—"}
                    </td>
                    <td className="px-2 py-3.5">
                      {lead.status ? (
                        <StatusBadge
                          label={lead.status.label}
                          color={lead.status.color}
                          size="sm"
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-3.5 text-[var(--color-ink-soft)]">
                      {lead.assignedUser?.name ?? lead.assignedUser?.email ?? "—"}
                    </td>
                    <td className="px-2 py-3.5 text-[var(--color-ink-soft)] tabular">
                      {formatDate(lead.createdAt)}
                    </td>
                    <td className="px-2 py-3.5">
                      {lead.tagsResolved.length === 0 ? (
                        <span className="text-[var(--color-ink-faint)]">—</span>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {lead.tagsResolved.map((tag) => (
                            <Badge key={tag.id} tone="muted" size="sm">
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          href={workspacePath(workspaceSlug, "leads", lead.id)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
                          aria-label={`Open ${lead.fullName}`}
                        >
                          <IconChevronRight size={14} />
                        </Link>
                        {canArchive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleArchive(lead.id, lead.fullName)}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--color-line)] bg-[var(--color-canvas)]">
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Showing{" "}
              <span className="text-[var(--color-ink)] font-medium">
                {total === 0 ? 0 : (page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, total)}
              </span>{" "}
              of <span className="text-[var(--color-ink)] font-medium">{total}</span> leads
            </p>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <IconChevronLeft size={14} />
              </button>
              <span className="px-2 text-[12.5px] text-[var(--color-ink-soft)] tabular">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-50"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                <IconChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
