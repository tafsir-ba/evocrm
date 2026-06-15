"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Label, Select } from "@/components/ui/input";
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

type CampaignFormState = {
  name: string;
  audienceType: "leads" | "opportunities";
  frequency: string;
  defaultFromName: string;
};

const emptyForm: CampaignFormState = {
  name: "",
  audienceType: "leads",
  frequency: "manual",
  defaultFromName: "",
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
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [showArchived, setShowArchived] = useState(true);
  const [audienceFilter, setAudienceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<CampaignFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          audienceType: form.audienceType,
          frequency: form.frequency.trim() || undefined,
          defaultFromName: form.defaultFromName.trim() || undefined,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setFormError(payload.error?.message ?? "Failed to create campaign.");
        return;
      }

      const campaignId = payload.data?.campaign?.id;
      setDrawerOpen(false);
      setForm(emptyForm);

      if (campaignId) {
        window.location.href = workspacePath(workspaceSlug, `dripping/${campaignId}`);
      } else {
        void loadCampaigns();
      }
    } catch {
      setFormError("Failed to create campaign.");
    } finally {
      setSubmitting(false);
    }
  }

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
              onClick={() => setDrawerOpen(true)}
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
              ? { label: "New campaign", onClick: () => setDrawerOpen(true) }
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

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="New campaign"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-campaign-form" disabled={submitting || !form.name.trim()}>
              {submitting ? "Creating…" : "Create campaign"}
            </Button>
          </div>
        }
      >
        <p className="text-[13px] text-[var(--color-ink-muted)] mb-4">
          Create a draft campaign. Add email steps before enrolling recipients.
        </p>
        <form id="new-campaign-form" onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <p className="text-[13px] text-[var(--color-danger)]">{formError}</p>
          )}
          <div>
            <Label htmlFor="campaign-name">Name</Label>
            <Input
              id="campaign-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="campaign-audience">Audience</Label>
            <Select
              id="campaign-audience"
              value={form.audienceType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  audienceType: e.target.value as CampaignFormState["audienceType"],
                }))
              }
            >
              <option value="leads">Leads</option>
              <option value="opportunities">Opportunities</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="campaign-frequency">Frequency (optional)</Label>
            <Input
              id="campaign-frequency"
              value={form.frequency}
              onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
              placeholder="manual"
            />
          </div>
          <div>
            <Label htmlFor="campaign-default-from">Default from name (optional)</Label>
            <Input
              id="campaign-default-from"
              value={form.defaultFromName}
              onChange={(e) => setForm((f) => ({ ...f, defaultFromName: e.target.value }))}
              placeholder="e.g. Grosvenor Vistas"
              maxLength={120}
            />
            <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
              Pre-fills new email steps. Each step can override this sender name.
            </p>
          </div>
        </form>
      </Drawer>
    </>
  );
}
