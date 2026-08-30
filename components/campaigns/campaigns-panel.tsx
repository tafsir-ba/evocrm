"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Select } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/status-badge";
import { IconPlus } from "@/lib/icons";
import { formatRelativeAge } from "@/lib/list-view";
import { appendProjectIdToSearchParams } from "@/lib/project-scope";
import { useWorkspaceProjectFilter } from "@/lib/use-workspace-project-filter";
import { workspacePath } from "@/lib/workspace-paths";

type CampaignListItem = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  audienceType: "leads" | "opportunities";
  frequency: string | null;
  defaultFromName: string | null;
  stepCount: number;
  enrollmentCount: number;
  updatedAt: string;
};

const STATUS_TONE: Record<CampaignListItem["status"], "neutral" | "success" | "warn" | "muted"> = {
  draft: "neutral",
  active: "success",
  paused: "warn",
  archived: "muted",
};

type CampaignsPanelProps = {
  workspaceSlug: string;
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
};

export function CampaignsPanel({
  workspaceSlug,
  canCreate,
}: CampaignsPanelProps) {
  const router = useRouter();
  const projectId = useWorkspaceProjectFilter();
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [audienceFilter, setAudienceFilter] = useState("");
  const [search, setSearch] = useState("");

  const apiBase = `/api/workspaces/${workspaceSlug}/campaigns`;
  const newCampaignPath = workspacePath(workspaceSlug, "dripping/new");

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const params = new URLSearchParams();
      if (showArchived) params.set("includeArchived", "true");
      if (statusFilter) params.set("status", statusFilter);
      if (audienceFilter) params.set("audienceType", audienceFilter);
      if (search.trim()) params.set("search", search.trim());
      appendProjectIdToSearchParams(params, projectId);

      const response = await fetch(`${apiBase}?${params.toString()}`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }

      if (!response.ok) {
        setError(payload.error?.message ?? "Failed to load campaigns.");
        return;
      }

      setCampaigns(payload.data ?? []);
      setTotal(payload.pagination?.total ?? payload.data?.length ?? 0);
    } catch {
      setError("Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, audienceFilter, projectId, search, showArchived, statusFilter]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  if (forbidden) {
    return (
      <PermissionDenied
        title="Permission denied"
        description="You do not have permission to view campaigns."
      />
    );
  }

  return (
    <>
      <PageHeader
        density="compact"
        title="Dripping"
        meta={
          <Badge tone="muted" size="sm">
            {total} campaigns
          </Badge>
        }
        actions={
          canCreate ? (
            <Button
              leadingIcon={<IconPlus size={14} />}
              onClick={() => router.push(newCampaignPath)}
            >
              New campaign
            </Button>
          ) : undefined
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <div className="min-w-[200px] max-w-xs flex-1">
          <Input
            placeholder="Search campaigns…"
            aria-label="Search campaigns"
            fieldSize="sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          fieldSize="sm"
          className="w-auto min-w-[140px]"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </Select>
        <Select
          fieldSize="sm"
          className="w-auto min-w-[140px]"
          aria-label="Filter by audience"
          value={audienceFilter}
          onChange={(event) => setAudienceFilter(event.target.value)}
        >
          <option value="">All audiences</option>
          <option value="leads">Leads</option>
          <option value="opportunities">Opportunities</option>
        </Select>
        <label className="inline-flex items-center gap-2 text-[13px] text-[var(--color-ink-muted)]">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>

      {loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load campaigns"
          description={error}
          primaryAction={{ label: "Retry", onClick: () => void loadCampaigns() }}
        />
      ) : campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create your first email drip campaign to automate follow-up with leads and opportunities."
          primaryAction={
            canCreate
              ? { label: "New campaign", onClick: () => router.push(newCampaignPath) }
              : undefined
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-[var(--color-line)] bg-white md:block">
            <Table density="compact">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Campaign</TableHeaderCell>
                  <TableHeaderCell className="w-[6rem]">Status</TableHeaderCell>
                  <TableHeaderCell className="w-[7.5rem]">Audience</TableHeaderCell>
                  <TableHeaderCell className="w-[4.5rem] text-right">Steps</TableHeaderCell>
                  <TableHeaderCell className="w-[5.5rem] text-right">Enrolled</TableHeaderCell>
                  <TableHeaderCell className="w-[5rem]">Updated</TableHeaderCell>
                  <TableHeaderCell className="w-[5.5rem] text-right">Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow
                    key={campaign.id}
                    className={campaign.status === "archived" ? "opacity-70" : undefined}
                  >
                    <TableCell>
                      <Link
                        href={workspacePath(workspaceSlug, `dripping/${campaign.id}`)}
                        className="truncate font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
                      >
                        {campaign.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={campaign.status}
                        tone={STATUS_TONE[campaign.status]}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="capitalize text-[var(--color-ink-soft)]">
                      {campaign.audienceType}
                    </TableCell>
                    <TableCell className="text-right tabular text-[var(--color-ink-soft)]">
                      {campaign.stepCount}
                    </TableCell>
                    <TableCell className="text-right tabular text-[var(--color-ink-soft)]">
                      {campaign.enrollmentCount}
                    </TableCell>
                    <TableCell className="tabular text-[var(--color-ink-muted)]">
                      {formatRelativeAge(campaign.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={workspacePath(workspaceSlug, `dripping/${campaign.id}/analytics`)}
                        className="text-[12px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                      >
                        Analytics
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-lg border border-[var(--color-line)] bg-white md:hidden">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={workspacePath(workspaceSlug, `dripping/${campaign.id}`)}
                    className="min-w-0 truncate font-semibold text-[var(--color-ink)]"
                  >
                    {campaign.name}
                  </Link>
                  <StatusBadge
                    status={campaign.status}
                    tone={STATUS_TONE[campaign.status]}
                    size="sm"
                  />
                </div>
                <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink-muted)]">
                  {campaign.audienceType} · {campaign.stepCount} steps · {campaign.enrollmentCount}{" "}
                  enrolled · {formatRelativeAge(campaign.updatedAt)}
                </p>
                <Link
                  href={workspacePath(workspaceSlug, `dripping/${campaign.id}/analytics`)}
                  className="mt-1 inline-block text-[12px] font-medium text-[var(--color-ink-soft)]"
                >
                  Analytics
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
