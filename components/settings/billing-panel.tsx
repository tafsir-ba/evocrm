"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";

type BillingShell = {
  planName: string;
  planStatus: string;
  billingOwner: string;
  stripeConnected: boolean;
  message: string;
};

type BillingPanelProps = {
  workspaceSlug: string;
};

export function BillingPanel({ workspaceSlug }: BillingPanelProps) {
  const [billing, setBilling] = useState<BillingShell | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/billing`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load billing.");
      }

      setBilling(payload.data.billing as BillingShell);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  if (forbidden) {
    return (
      <PermissionDenied
        title="Billing unavailable"
        description="You do not have permission to view billing. Requires billing:manage."
      />
    );
  }

  if (loading) {
    return (
      <Card>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }

  if (error || !billing) {
    return (
      <ErrorState
        title="Could not load billing"
        description={error ?? "Billing unavailable."}
        primaryAction={{ label: "Retry", onClick: () => void loadBilling() }}
      />
    );
  }

  return (
    <Card>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Info label="Current plan" value={billing.planName} />
          <Info label="Status" value={billing.planStatus} />
          <Info label="Billing owner" value={billing.billingOwner} />
          <Info
            label="Stripe"
            value={billing.stripeConnected ? "Connected" : "Not connected"}
          />
        </div>
        <p className="text-[12.5px] text-[var(--color-ink-muted)] leading-relaxed">
          {billing.message}
        </p>
        <Button variant="secondary" size="sm" disabled>
          Connect Stripe (coming later)
        </Button>
      </div>
    </Card>
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
