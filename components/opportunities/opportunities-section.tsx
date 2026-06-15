"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { IconPlus } from "@/lib/icons";
import { formatDate, formatPrice } from "@/lib/format-price";
import { workspacePath } from "@/lib/workspace-paths";

type OpportunityListItem = {
  id: string;
  value: number | null;
  currency: string;
  probability: number | null;
  expectedCloseDate: string | null;
  status: { id: string; label: string; color: string; behavior?: string } | null;
  lead: { id: string; fullName: string } | null;
  property: { id: string; title: string; reference: string | null } | null;
};

type OpportunitiesSectionProps = {
  workspaceSlug: string;
  defaultCurrency: string;
  leadId?: string;
  propertyId?: string;
  canRead: boolean;
  canCreate: boolean;
};

function createOpportunityPath(
  workspaceSlug: string,
  leadId?: string,
  propertyId?: string,
): string {
  const params = new URLSearchParams();
  if (leadId) params.set("leadId", leadId);
  if (propertyId) params.set("propertyId", propertyId);
  const query = params.toString();
  return query
    ? `${workspacePath(workspaceSlug, "opportunities", "new")}?${query}`
    : workspacePath(workspaceSlug, "opportunities", "new");
}

export function OpportunitiesSection({
  workspaceSlug,
  defaultCurrency: _defaultCurrency,
  leadId,
  propertyId,
  canRead,
  canCreate,
}: OpportunitiesSectionProps) {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<OpportunityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const createHref = createOpportunityPath(workspaceSlug, leadId, propertyId);

  const loadOpportunities = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ pageSize: "50" });
      if (leadId) params.set("leadId", leadId);
      if (propertyId) params.set("propertyId", propertyId);

      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/opportunities?${params.toString()}`,
      );

      if (response.status === 403) {
        setOpportunities([]);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to load opportunities.");
      }

      const body = (await response.json()) as { data: OpportunityListItem[] };
      setOpportunities(body.data);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load opportunities.",
      );
    } finally {
      setLoading(false);
    }
  }, [canRead, leadId, propertyId, workspaceSlug]);

  useEffect(() => {
    void loadOpportunities();
  }, [loadOpportunities]);

  if (!canRead) {
    return (
      <div className="px-5 pb-5">
        <EmptyState
          title="Opportunities unavailable"
          description="You do not have permission to view opportunities."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-5 pb-5 space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-5 pb-5">
        <ErrorState
          title="Could not load opportunities"
          description={error}
          primaryAction={{ label: "Retry", onClick: () => void loadOpportunities() }}
        />
      </div>
    );
  }

  return (
    <div className="px-5 pb-5">
      {canCreate && (
        <div className="mb-4 flex justify-end">
          <Button
            size="sm"
            leadingIcon={<IconPlus size={13} />}
            onClick={() => router.push(createHref)}
          >
            Create opportunity
          </Button>
        </div>
      )}

      {opportunities.length === 0 ? (
        <EmptyState
          title="No opportunities linked"
          description={
            leadId
              ? "When this lead is matched to a property, an opportunity will appear here."
              : "When a lead is matched to this property, an opportunity will appear here."
          }
          primaryAction={
            canCreate
              ? { label: "Create opportunity", onClick: () => router.push(createHref) }
              : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] rounded-lg">
          {opportunities.map((opportunity) => (
            <li key={opportunity.id}>
              <Link
                href={workspacePath(workspaceSlug, "opportunities", opportunity.id)}
                className="flex items-center justify-between gap-3 p-3 hover:bg-[var(--color-canvas)]"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-[var(--color-ink)] truncate">
                    {leadId
                      ? opportunity.property?.title ?? "Property"
                      : opportunity.lead?.fullName ?? "Lead"}
                  </p>
                  <p className="text-[12px] text-[var(--color-ink-muted)] truncate">
                    {formatPrice(opportunity.value, opportunity.currency)}
                    {opportunity.probability !== null
                      ? ` · ${opportunity.probability}%`
                      : ""}
                    {opportunity.expectedCloseDate
                      ? ` · Close ${formatDate(opportunity.expectedCloseDate)}`
                      : ""}
                  </p>
                </div>
                {opportunity.status && (
                  <StatusBadge
                    label={opportunity.status.label}
                    color={opportunity.status.color}
                    behavior={opportunity.status.behavior}
                    size="sm"
                  />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
