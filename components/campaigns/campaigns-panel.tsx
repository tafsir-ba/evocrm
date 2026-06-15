"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Select } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/status-badge";
import { IconChevronRight, IconMail, IconPlus } from "@/lib/icons";
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
  }, [apiBase, audienceFilter, search, showArchived, statusFilter]);

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
        title="Dripping"
        description="Simple email follow-up campaigns. Enroll leads or opportunities into multi-step sequences."
        meta={<Badge tone="muted" size="sm">{total} campaigns</Badge>}
        actions={
          canCreate ? (
            <Button
              leadingIcon={<IconPlus size={14} />}
              onClick={() => router.push(workspacePath(workspaceSlug, "dripping/new"))}
            >
              New campaign
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search campaigns…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </Select>
        <label className="inline-flex items-center gap-2 text-[13px] text-[var(--color-ink-muted)]">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
        <Select
          value={audienceFilter}
          onChange={(e) => setAudienceFilter(e.target.value)}
        >
          <option value="">All audiences</option>
          <option value="leads">Leads</option>
          <option value="opportunities">Opportunities</option>
        </Select>
        <Button variant="secondary" onClick={() => void loadCampaigns()}>
          Apply
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[200px] rounded-xl" />
          ))}
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
              ? {
                  label: "New campaign",
                  onClick: () => router.push(workspacePath(workspaceSlug, "dripping/new")),
                }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <Card
              key={campaign.id}
              className={`!p-0 group ${campaign.status === "archived" ? "opacity-75" : ""}`}
            >
              <div className="p-5 border-b border-[var(--color-line)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[var(--color-ink)] tracking-tight truncate">
                      {campaign.name}
                    </p>
                    <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5 capitalize">
                      Audience · {campaign.audienceType}
                    </p>
                  </div>
                  <StatusBadge status={campaign.status} tone={STATUS_TONE[campaign.status]} size="sm" />
                </div>
                <div className="flex items-center gap-2 mt-3 text-[12px] text-[var(--color-ink-muted)]">
                  <IconMail size={14} />
                  <span>{campaign.stepCount} steps</span>
                  <span>·</span>
                  <span>{campaign.enrollmentCount} enrolled</span>
                </div>
              </div>
              <div className="p-5 flex items-center justify-between text-[12px]">
                <span className="text-[var(--color-ink-muted)]">
                  Updated {new Date(campaign.updatedAt).toLocaleDateString()}
                </span>
                <Link
                  href={workspacePath(workspaceSlug, `dripping/${campaign.id}`)}
                  className="text-[var(--color-brand-700)] font-medium inline-flex items-center gap-1 hover:underline"
                >
                  Open <IconChevronRight size={12} />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
